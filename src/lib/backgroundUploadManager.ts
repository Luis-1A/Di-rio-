/**
 * Background Upload & Sync Manager
 *
 * Implements a Local-First, Non-Blocking background worker:
 * 1. Saves media binary immediately in IndexedDB.
 * 2. Emits local record immediately for zero-wait UX.
 * 3. Enqueues item in persistent IndexedDB queue.
 * 4. Processes upload queue in background using Firebase Storage resumable upload.
 * 5. Writes clean metadata to Firestore with timeout fallback.
 * 6. Emits live queue updates to UI indicators.
 * 7. Automatically resumes on network reconnection and 30s reconciliation.
 */

import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  UploadTask,
} from 'firebase/storage';
import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import {
  BackgroundUploadItem,
  DiaryRecord,
  RecordAttachment,
  RecordType,
  UploadQueueStatus,
} from '../types';
import {
  saveLocalMediaBlob,
  getLocalMediaBlob,
  saveQueueItem,
  getAllQueueItems,
  deleteQueueItem,
  getQueueItem,
} from './idbStorage';
import { sanitizeForFirestore } from './firestoreService';
import { syncQueue, generateOperationId } from './syncQueue';

type QueueListener = (items: BackgroundUploadItem[]) => void;
const listeners = new Set<QueueListener>();
const activeUploadTasks = new Map<string, UploadTask>();
let isQueueProcessing = false;

function notifyListeners(items: BackgroundUploadItem[]) {
  listeners.forEach((fn) => {
    try {
      fn(items);
    } catch (e) {
      console.warn('[BACKGROUND QUEUE] Listener warning:', e);
    }
  });
}

export function subscribeToUploadQueue(
  userId: string,
  callback: QueueListener
): () => void {
  listeners.add(callback);
  // Initial fire
  getAllQueueItems(userId).then(callback).catch(() => callback([]));

  return () => {
    listeners.delete(callback);
  };
}

/**
 * 1. Enqueue New Upload (Instant Local-First Return)
 */
export async function enqueueBackgroundUpload(params: {
  uid: string;
  recordId?: string;
  type: RecordType;
  title: string;
  content: string;
  date: string;
  time: string;
  category?: string;
  tags?: string[];
  fileOrBlob?: File | Blob | null;
  fileName?: string;
  mimeType?: string;
  audioDurationSeconds?: number;
  transcript?: string;
  existingAttachments?: RecordAttachment[];
}): Promise<DiaryRecord> {
  const {
    uid,
    type,
    title,
    content,
    date,
    time,
    category = 'geral',
    tags = [],
    fileOrBlob,
    fileName,
    mimeType,
    audioDurationSeconds,
    transcript,
    existingAttachments = [],
  } = params;

  const recordId =
    params.recordId ||
    `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  const queueId = `queue_${recordId}_${Date.now()}`;

  let localBlobUrl = '';
  let resolvedFileName = fileName || '';
  let resolvedMimeType = mimeType || '';
  let resolvedSize = 0;

  let attachments: RecordAttachment[] = [...existingAttachments];

  // Save binary file locally in IndexedDB if present
  if (fileOrBlob && type !== 'text') {
    resolvedSize = fileOrBlob.size;
    resolvedFileName =
      fileName ||
      (fileOrBlob instanceof File
        ? fileOrBlob.name
        : `gravacao_${Date.now()}.${type === 'audio' ? 'webm' : type === 'photo' ? 'jpg' : type === 'video' ? 'mp4' : 'pdf'}`);
    resolvedMimeType =
      mimeType || fileOrBlob.type || 'application/octet-stream';

    // 1. Store raw blob in IndexedDB
    await saveLocalMediaBlob(recordId, fileOrBlob, resolvedFileName, resolvedMimeType);
    localBlobUrl = URL.createObjectURL(fileOrBlob);

    const newAtt: RecordAttachment = {
      id: `att_${Date.now()}`,
      name: resolvedFileName,
      type:
        type === 'photo'
          ? 'image'
          : type === 'document'
          ? 'document'
          : (type as any),
      url: localBlobUrl,
      size: resolvedSize,
      mimeType: resolvedMimeType,
      durationSeconds: audioDurationSeconds,
      transcript,
      transcriptStatus: transcript ? 'completed' : undefined,
    };
    attachments = [newAtt];

    // 2. Add item to persistent IndexedDB upload queue
    const queueItem: BackgroundUploadItem = {
      id: queueId,
      recordId,
      userId: uid,
      type,
      title: title.trim() || (type === 'photo' ? 'Foto' : type === 'audio' ? 'Áudio' : type === 'video' ? 'Vídeo' : type === 'document' ? 'Arquivo' : 'Registro'),
      description: content.trim(),
      content: content.trim(),
      date,
      time,
      category,
      tags,
      fileName: resolvedFileName,
      fileSize: resolvedSize,
      mimeType: resolvedMimeType,
      status: 'pending_upload',
      progress: 0,
      retryCount: 0,
      audioDurationSeconds,
      transcript,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveQueueItem(queueItem);
  }

  // 3. Create local DiaryRecord representation
  const localRecord: DiaryRecord = {
    id: recordId,
    userId: uid,
    title:
      title.trim() ||
      (type === 'photo'
        ? 'Foto'
        : type === 'audio'
        ? 'Áudio'
        : type === 'video'
        ? 'Vídeo'
        : type === 'document'
        ? 'Arquivo'
        : 'Registro pessoal'),
    content: content.trim(),
    description: content.trim(),
    type,
    date: date || now.split('T')[0],
    time:
      time ||
      `${new Date().getHours().toString().padStart(2, '0')}:${new Date()
        .getMinutes()
        .toString()
        .padStart(2, '0')}`,
    category,
    tags,
    attachments,
    downloadUrl: localBlobUrl || undefined,
    fileName: resolvedFileName || undefined,
    fileSize: resolvedSize || undefined,
    mimeType: resolvedMimeType || undefined,
    uploadStatus: fileOrBlob ? 'pending' : 'completed',
    isFavorite: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    operationId: generateOperationId('bg_rec'),
    syncStatus: fileOrBlob ? 'pending' : 'synced',
  };

  // If it's a pure text record with no media, write directly or enqueue for sync
  if (!fileOrBlob || type === 'text') {
    const docRef = doc(db, 'users', uid, 'records', recordId);
    setDoc(
      docRef,
      sanitizeForFirestore({
        ...localRecord,
        _serverTimestamp: serverTimestamp(),
      })
    ).catch((err) => {
      console.warn('[BACKGROUND QUEUE] Text write fallback:', err);
      syncQueue.enqueue({
        operationId: localRecord.operationId,
        entityType: 'record',
        action: 'create',
        payload: { uid, record: localRecord },
      });
    });
  } else {
    // Notify active listeners
    getAllQueueItems(uid).then(notifyListeners);
    // Fire background queue worker immediately
    setTimeout(() => {
      processBackgroundUploadQueue(uid).catch((err) =>
        console.warn('[BACKGROUND QUEUE] Process trigger warning:', err)
      );
    }, 50);
  }

  return localRecord;
}

/**
 * 2. Background Queue Processor (Uploads to Storage & Writes to Firestore in Background)
 */
export async function processBackgroundUploadQueue(userId: string): Promise<void> {
  if (isQueueProcessing) {
    console.log('[BACKGROUND QUEUE] Queue is already processing...');
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[BACKGROUND QUEUE] Dispositivo offline. Fila aguardando conexão.');
    return;
  }

  isQueueProcessing = true;
  console.log(`[BACKGROUND QUEUE] Iniciando processamento da fila para usuário: ${userId}`);

  try {
    const items = await getAllQueueItems(userId);
    // Filter pending or failed with retries < 5
    const pendingItems = items.filter(
      (it) =>
        it.status === 'pending_upload' ||
        (it.status === 'upload_error' && it.retryCount < 5) ||
        it.status === 'uploaded'
    );

    // Sort by createdAt ascending (FIFO)
    pendingItems.sort((a, b) => a.createdAt - b.createdAt);

    for (const item of pendingItems) {
      await processSingleQueueItem(item);
    }
  } catch (err) {
    console.warn('[BACKGROUND QUEUE] Queue iteration warning:', err);
  } finally {
    isQueueProcessing = false;
    getAllQueueItems(userId).then(notifyListeners);
  }
}

/**
 * Process a single upload item
 */
async function processSingleQueueItem(item: BackgroundUploadItem): Promise<void> {
  const { userId, recordId, id: queueId } = item;
  console.log(`[BACKGROUND QUEUE] Processando item ${queueId} (recordId: ${recordId})...`);

  // Step A: Check if already uploaded and just needs Firestore sync
  if (item.status === 'uploaded' && item.downloadUrl && item.storagePath) {
    await finalizeFirestoreRecord(item, item.downloadUrl, item.storagePath);
    return;
  }

  // Step B: Retrieve local media blob from IndexedDB
  const mediaStored = await getLocalMediaBlob(recordId);
  if (!mediaStored || !mediaStored.blob) {
    console.warn(`[BACKGROUND QUEUE] Blob não encontrado no IndexedDB para ${recordId}. Marcando como falha.`);
    item.status = 'upload_error';
    item.errorMessage = 'Arquivo local não encontrado no navegador.';
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    return;
  }

  // Step C: Start Firebase Storage Resumable Upload
  item.status = 'uploading';
  item.progress = Math.max(5, item.progress || 5);
  item.updatedAt = Date.now();
  await saveQueueItem(item);
  getAllQueueItems(userId).then(notifyListeners);

  const sanitizedFileName = item.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${userId}/registros/${recordId}/${sanitizedFileName}`;

  try {
    const sRef = storageRef(storage, storagePath);
    const uploadTask = uploadBytesResumable(sRef, mediaStored.blob, {
      contentType: item.mimeType || mediaStored.mimeType,
    });
    activeUploadTasks.set(queueId, uploadTask);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const total = snapshot.totalBytes;
          const transferred = snapshot.bytesTransferred;
          if (total > 0) {
            const rawPercent = Math.round((transferred / total) * 100);
            // Map progress smoothly: 10% to 85%
            const mappedPercent = Math.min(85, Math.max(10, Math.round(10 + (transferred / total) * 75)));
            item.progress = mappedPercent;
            item.updatedAt = Date.now();
            saveQueueItem(item);
            getAllQueueItems(userId).then(notifyListeners);
          }
        },
        (error) => {
          activeUploadTasks.delete(queueId);
          reject(error);
        },
        async () => {
          activeUploadTasks.delete(queueId);
          resolve();
        }
      );
    });

    // Step D: Get Download URL
    const sRefDone = storageRef(storage, storagePath);
    const downloadUrl = await getDownloadURL(sRefDone);

    item.status = 'uploaded';
    item.progress = 90;
    item.storagePath = storagePath;
    item.downloadUrl = downloadUrl;
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);

    console.log(`[BACKGROUND QUEUE] Storage upload concluído com sucesso para ${recordId}: ${downloadUrl}`);

    // Step E: Finalize Firestore Document
    await finalizeFirestoreRecord(item, downloadUrl, storagePath);
  } catch (uploadError: any) {
    activeUploadTasks.delete(queueId);
    console.warn(`[BACKGROUND QUEUE] Erro no upload do item ${recordId}:`, uploadError);

    item.status = 'upload_error';
    item.errorMessage = uploadError?.message || 'Falha ao enviar arquivo para o Firebase Storage.';
    item.retryCount = (item.retryCount || 0) + 1;
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);
  }
}

/**
 * Write/Update finalized metadata to Firestore
 */
async function finalizeFirestoreRecord(
  item: BackgroundUploadItem,
  downloadUrl: string,
  storagePath: string
): Promise<void> {
  const { userId, recordId } = item;
  const now = new Date().toISOString();

  const attachment: RecordAttachment = {
    id: `att_${Date.now()}`,
    name: item.fileName,
    type:
      item.type === 'photo'
        ? 'image'
        : item.type === 'document'
        ? 'document'
        : (item.type as any),
    url: downloadUrl,
    storagePath,
    size: item.fileSize,
    mimeType: item.mimeType,
    durationSeconds: item.audioDurationSeconds,
    transcript: item.transcript,
    transcriptStatus: item.transcript ? 'completed' : undefined,
  };

  const fullRecord: DiaryRecord = {
    id: recordId,
    userId,
    title: item.title,
    content: item.content,
    description: item.content,
    type: item.type,
    date: item.date,
    time: item.time,
    category: item.category,
    tags: item.tags,
    attachments: [attachment],
    storagePath,
    downloadUrl,
    fileName: item.fileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    uploadStatus: 'completed',
    isFavorite: false,
    isDeleted: false,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: now,
    operationId: generateOperationId('bg_sync_done'),
    syncStatus: 'synced',
  };

  try {
    const docRef = doc(db, 'users', userId, 'records', recordId);
    // Timeout-protected write
    const writePromise = setDoc(
      docRef,
      sanitizeForFirestore({
        ...fullRecord,
        _serverTimestamp: serverTimestamp(),
      })
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 8000)
    );

    await Promise.race([writePromise, timeoutPromise]);
    console.log(`[BACKGROUND QUEUE] Firestore document gravado e sincronizado: ${recordId}`);

    item.status = 'synced';
    item.progress = 100;
    item.errorMessage = undefined;
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);
  } catch (firestoreErr: any) {
    console.warn(`[BACKGROUND QUEUE] Firestore write warning para ${recordId}, mantendo na fila:`, firestoreErr);
    item.status = 'uploaded'; // Keep as uploaded so we don't re-upload bytes to Storage
    item.progress = 90;
    item.errorMessage = 'Aguardando confirmação do Firestore.';
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);
  }
}

/**
 * Retry a specific failed queue item
 */
export async function retryQueueItem(queueId: string, userId: string): Promise<void> {
  const item = await getQueueItem(queueId);
  if (!item) return;

  item.status = 'pending_upload';
  item.errorMessage = undefined;
  item.updatedAt = Date.now();
  await saveQueueItem(item);
  getAllQueueItems(userId).then(notifyListeners);

  processBackgroundUploadQueue(userId).catch(console.warn);
}

/**
 * Cancel/Remove a queue item
 */
export async function cancelQueueItem(queueId: string, userId: string): Promise<void> {
  const task = activeUploadTasks.get(queueId);
  if (task) {
    try {
      task.cancel();
    } catch {}
    activeUploadTasks.delete(queueId);
  }
  await deleteQueueItem(queueId);
  getAllQueueItems(userId).then(notifyListeners);
}

// Global Online Listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[BACKGROUND QUEUE] Conexão detectada. Reiniciando fila de uploads...');
    // Process for any active cached user
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith('diario_pessoal_records_cache_')
    );
    keys.forEach((k) => {
      const uid = k.replace('diario_pessoal_records_cache_', '');
      if (uid) {
        processBackgroundUploadQueue(uid).catch(console.warn);
      }
    });
  });
}
