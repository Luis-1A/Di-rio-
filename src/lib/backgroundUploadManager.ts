/**
 * Background Upload & Sync Manager
 *
 * Implements a Robust, Non-Blocking, Local-First Architecture:
 * 1. Instant local persistence (media blob in IndexedDB + immediate DiaryRecord emission).
 * 2. Unblocked UI: The user can continue creating notes, browsing, or closing screens.
 * 3. Unique recordId mapping: Every upload is strictly tied to recordId.
 * 4. Immediate Cancel & Purge on Delete: If the user deletes a record, the upload task is
 *    aborted immediately, the queue item is purged, local blobs are deleted, and tombstones
 *    prevent ANY delayed retry or resurrection.
 * 5. Bounded Retries: Max 2 retries (total 3 attempts). No infinite uploading loops.
 * 6. De-duplication: Avoids re-uploading files already uploaded and verified.
 * 7. Real Firestore sync: Saves permanent HTTPS downloadUrl so other devices access media seamlessly.
 */

import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
} from 'firebase/storage';
import {
  doc,
  setDoc,
  deleteDoc,
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
  deleteLocalMediaBlob,
  saveQueueItem,
  getAllQueueItems,
  deleteQueueItem,
  deleteQueueItemsByRecordId,
  getQueueItem,
  addDeletedTombstone,
  isDeletedTombstoned,
} from './idbStorage';
import { sanitizeForFirestore } from './firestoreService';
import { syncQueue, generateOperationId } from './syncQueue';
import {
  compressImage,
  extractVideoThumbnail,
  compressSmallTextFile,
  compactMetadata,
} from './mediaCompressor';

type QueueListener = (items: BackgroundUploadItem[]) => void;
const listeners = new Set<QueueListener>();

// Map active upload tasks by both queueId and recordId for instant cancellation
const activeUploadTasks = new Map<string, UploadTask>();
let isQueueProcessing = false;
const MAX_RETRIES = 2; // initial + 2 retries = 3 attempts total

function notifyListeners(items: BackgroundUploadItem[]) {
  listeners.forEach((fn) => {
    try {
      fn(items);
    } catch (e) {
      console.warn('[BACKGROUND QUEUE] Listener error:', e);
    }
  });
}

export function subscribeToUploadQueue(
  userId: string,
  callback: QueueListener
): () => void {
  listeners.add(callback);
  // Initial fire with filtered active items
  getAllQueueItems(userId)
    .then((items) => {
      // Filter out items whose recordId has been tombstoned (deleted)
      const valid = items.filter((it) => !isDeletedTombstoned(it.recordId));
      callback(valid);
    })
    .catch(() => callback([]));

  return () => {
    listeners.delete(callback);
  };
}

/**
 * 1. Enqueue New Upload (Instant Local-First Return, Non-Blocking)
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
  thumbnailUrl?: string;
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
  const queueId = `queue_${recordId}`;

  let localBlobUrl = '';
  let resolvedFileName = fileName || '';
  let resolvedMimeType = mimeType || '';
  let resolvedSize = 0;
  let finalBlobToUpload = fileOrBlob;
  let resolvedThumbnailUrl = params.thumbnailUrl || '';

  let attachments: RecordAttachment[] = [...existingAttachments];

  // Process and compress media before queuing
  if (fileOrBlob && type !== 'text') {
    resolvedSize = fileOrBlob.size;
    resolvedFileName =
      fileName ||
      (fileOrBlob instanceof File
        ? fileOrBlob.name
        : `gravacao_${Date.now()}.${
            type === 'audio'
              ? 'webm'
              : type === 'photo'
              ? 'jpg'
              : type === 'video'
              ? 'mp4'
              : 'pdf'
          }`);
    resolvedMimeType =
      mimeType || fileOrBlob.type || 'application/octet-stream';

    // 1. High-Performance Client-Side Image Compression & Micro Thumbnail
    if (type === 'photo' || (fileOrBlob.type && fileOrBlob.type.startsWith('image/'))) {
      try {
        const compressed = await compressImage(fileOrBlob, resolvedFileName);
        finalBlobToUpload = compressed.fileOrBlob;
        resolvedFileName = compressed.fileName;
        resolvedMimeType = compressed.mimeType;
        resolvedSize = compressed.size;
        if (!resolvedThumbnailUrl && compressed.thumbnailUrl) {
          resolvedThumbnailUrl = compressed.thumbnailUrl;
        }
      } catch (e) {
        console.warn('[BACKGROUND QUEUE] Image compression error, using raw file:', e);
      }
    } else if (type === 'document' || (fileOrBlob.type && (fileOrBlob.type.startsWith('text/') || fileOrBlob.type === 'application/json'))) {
      // 2. High-Performance Small Text File Compression
      try {
        const compText = await compressSmallTextFile(fileOrBlob, resolvedFileName, resolvedMimeType);
        if (compText.isCompressed) {
          finalBlobToUpload = compText.fileOrBlob;
          resolvedSize = compText.size;
        }
      } catch (e) {
        console.warn('[BACKGROUND QUEUE] Text compression fallback:', e);
      }
    }

    // 3. Extract Lightweight Video Thumbnail for Instant Cross-Device Preview
    if ((type === 'video' || (fileOrBlob.type && fileOrBlob.type.startsWith('video/'))) && !resolvedThumbnailUrl) {
      try {
        const thumb = await extractVideoThumbnail(fileOrBlob);
        if (thumb) {
          resolvedThumbnailUrl = thumb;
        }
      } catch (e) {
        console.warn('[BACKGROUND QUEUE] Video thumbnail extraction error:', e);
      }
    }

    // 4. Store raw binary blob in IndexedDB for instant, zero-latency local playback
    if (finalBlobToUpload) {
      await saveLocalMediaBlob(recordId, finalBlobToUpload, resolvedFileName, resolvedMimeType);
      localBlobUrl = URL.createObjectURL(finalBlobToUpload);
    }

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
      thumbnailUrl: resolvedThumbnailUrl || undefined,
      size: resolvedSize,
      mimeType: resolvedMimeType,
      durationSeconds: audioDurationSeconds,
      transcript,
      transcriptStatus: transcript ? 'completed' : undefined,
    };
    attachments = [newAtt];

    // 4. Add item to persistent IndexedDB upload queue
    const queueItem: BackgroundUploadItem = {
      id: queueId,
      recordId,
      userId: uid,
      type,
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
          : 'Registro'),
      description: content.trim(),
      content: content.trim(),
      date,
      time,
      category,
      tags,
      fileName: resolvedFileName,
      fileSize: resolvedSize,
      mimeType: resolvedMimeType,
      thumbnailUrl: resolvedThumbnailUrl || undefined,
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

  // 5. Create local DiaryRecord representation immediately
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
    thumbnailUrl: resolvedThumbnailUrl || undefined,
    fileName: resolvedFileName || undefined,
    fileSize: resolvedSize || undefined,
    mimeType: resolvedMimeType || undefined,
    uploadStatus: finalBlobToUpload ? 'uploading' : 'completed',
    isFavorite: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    operationId: generateOperationId('bg_rec'),
    syncStatus: finalBlobToUpload ? 'uploading' : 'synced',
  };

  // 6. CRITICAL: PUBLISH TO FIRESTORE IMMEDIATELY (Cross-Device Instant Visibility)
  // This allows the user's notebook to receive and display the record in < 1 second!
  const docRef = doc(db, 'users', uid, 'records', recordId);
  setDoc(
    docRef,
    sanitizeForFirestore({
      ...localRecord,
      _serverTimestamp: serverTimestamp(),
    })
  ).catch((err) => {
    console.warn('[BACKGROUND QUEUE] Immediate firestore write fallback:', err);
    syncQueue.enqueue({
      operationId: localRecord.operationId,
      entityType: 'record',
      action: 'create',
      payload: { uid, record: localRecord },
    });
  });

  if (finalBlobToUpload && type !== 'text') {
    // Notify active listeners of new queued item
    getAllQueueItems(uid).then(notifyListeners);

    // Fire background queue worker immediately in non-blocking way
    setTimeout(() => {
      processBackgroundUploadQueue(uid).catch((err) =>
        console.warn('[BACKGROUND QUEUE] Process trigger warning:', err)
      );
    }, 20);
  }

  return localRecord;
}

/**
 * 2. Background Queue Processor
 */
export async function processBackgroundUploadQueue(userId: string): Promise<void> {
  if (isQueueProcessing) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[BACKGROUND QUEUE] Dispositivo offline. Fila aguardando conexão.');
    return;
  }

  isQueueProcessing = true;

  try {
    const items = await getAllQueueItems(userId);

    // Filter active items and purge any tombstoned/deleted items
    const activeItems: BackgroundUploadItem[] = [];

    for (const item of items) {
      if (isDeletedTombstoned(item.recordId)) {
        // Record was deleted by user! Clean up immediately
        console.log(`[BACKGROUND QUEUE] Removendo item apagado da fila: ${item.recordId}`);
        await cancelAndPurgeRecordUpload(item.recordId, userId);
        continue;
      }

      // Keep items that need processing
      if (
        item.status === 'pending_upload' ||
        item.status === 'pending' ||
        (item.status === 'upload_error' && (item.retryCount || 0) < MAX_RETRIES) ||
        (item.status === 'failed' && (item.retryCount || 0) < MAX_RETRIES) ||
        item.status === 'uploaded'
      ) {
        activeItems.push(item);
      }
    }

    // Sort FIFO by createdAt
    activeItems.sort((a, b) => a.createdAt - b.createdAt);

    for (const item of activeItems) {
      // Re-verify tombstone before processing each item
      if (isDeletedTombstoned(item.recordId)) {
        await cancelAndPurgeRecordUpload(item.recordId, userId);
        continue;
      }
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
 * 3. Process a single upload item with strict tombstone checks
 */
async function processSingleQueueItem(item: BackgroundUploadItem): Promise<void> {
  const { userId, recordId, id: queueId } = item;

  // Pre-flight check 1: Was this record deleted?
  if (isDeletedTombstoned(recordId)) {
    console.log(`[BACKGROUND QUEUE] Abortando upload de registro deletado: ${recordId}`);
    await cancelAndPurgeRecordUpload(recordId, userId);
    return;
  }

  // Pre-flight check 2: If already uploaded & has downloadUrl, just sync to Firestore
  if (
    (item.status === 'uploaded' || item.status === 'completed') &&
    item.downloadUrl &&
    item.storagePath
  ) {
    await finalizeFirestoreRecord(item, item.downloadUrl, item.storagePath);
    return;
  }

  // Pre-flight check 3: Retrieve local binary blob
  const mediaStored = await getLocalMediaBlob(recordId);
  if (!mediaStored || !mediaStored.blob) {
    console.warn(`[BACKGROUND QUEUE] Blob não encontrado no IndexedDB para ${recordId}.`);
    item.status = 'upload_error';
    item.errorMessage = 'Arquivo local não encontrado no navegador.';
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    return;
  }

  // Step C: Mark Uploading
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
      cacheControl: 'public, max-age=31536000, immutable',
      customMetadata: {
        recordId,
        compressed: 'true',
        uploadedAt: String(Date.now()),
      },
    });

    // Store task references by both queueId and recordId for instant cancellation
    activeUploadTasks.set(queueId, uploadTask);
    activeUploadTasks.set(recordId, uploadTask);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // In-flight cancellation check: If record was deleted during upload, abort immediately
          if (isDeletedTombstoned(recordId)) {
            try {
              uploadTask.cancel();
            } catch {}
            activeUploadTasks.delete(queueId);
            activeUploadTasks.delete(recordId);
            reject(new Error('RECORD_DELETED_DURING_UPLOAD'));
            return;
          }

          const total = snapshot.totalBytes;
          const transferred = snapshot.bytesTransferred;
          if (total > 0) {
            const mappedPercent = Math.min(
              88,
              Math.max(10, Math.round(10 + (transferred / total) * 78))
            );
            item.progress = mappedPercent;
            item.updatedAt = Date.now();
            saveQueueItem(item);
            getAllQueueItems(userId).then(notifyListeners);
          }
        },
        (error) => {
          activeUploadTasks.delete(queueId);
          activeUploadTasks.delete(recordId);
          reject(error);
        },
        async () => {
          activeUploadTasks.delete(queueId);
          activeUploadTasks.delete(recordId);
          resolve();
        }
      );
    });

    // Verify tombstone once again before obtaining URL and writing Firestore
    if (isDeletedTombstoned(recordId)) {
      console.log(`[BACKGROUND QUEUE] Registro ${recordId} deletado após upload. Removendo arquivo do Storage.`);
      try {
        const sRefCleanup = storageRef(storage, storagePath);
        await deleteObject(sRefCleanup);
      } catch {}
      await cancelAndPurgeRecordUpload(recordId, userId);
      return;
    }

    // Step D: Get permanent download URL
    const sRefDone = storageRef(storage, storagePath);
    const downloadUrl = await getDownloadURL(sRefDone);

    item.status = 'uploaded';
    item.progress = 92;
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
    activeUploadTasks.delete(recordId);

    if (uploadError?.message === 'RECORD_DELETED_DURING_UPLOAD' || isDeletedTombstoned(recordId)) {
      await cancelAndPurgeRecordUpload(recordId, userId);
      return;
    }

    console.warn(`[BACKGROUND QUEUE] Erro no upload do item ${recordId}:`, uploadError);

    const nextRetry = (item.retryCount || 0) + 1;
    item.retryCount = nextRetry;
    item.updatedAt = Date.now();

    if (nextRetry >= MAX_RETRIES) {
      item.status = 'upload_error';
      item.errorMessage = 'Não foi possível enviar este arquivo. Toque para tentar novamente.';
    } else {
      item.status = 'upload_error';
      item.errorMessage = `Falha ao conectar com o servidor. Nova tentativa (${nextRetry}/${MAX_RETRIES})...`;
    }

    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);
  }
}

/**
 * 4. Write/Update finalized metadata to Firestore
 */
async function finalizeFirestoreRecord(
  item: BackgroundUploadItem,
  downloadUrl: string,
  storagePath: string
): Promise<void> {
  const { userId, recordId } = item;

  // Check tombstone: If user deleted the record, never write it to Firestore!
  if (isDeletedTombstoned(recordId)) {
    console.log(`[BACKGROUND QUEUE] Abortando escrita no Firestore de registro apagado: ${recordId}`);
    await cancelAndPurgeRecordUpload(recordId, userId);
    return;
  }

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
    thumbnailUrl: item.thumbnailUrl,
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
    thumbnailUrl: item.thumbnailUrl,
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
    console.warn(`[BACKGROUND QUEUE] Firestore write warning para ${recordId}:`, firestoreErr);
    // Keep uploaded status so we don't re-upload bytes to Storage
    item.status = 'uploaded';
    item.progress = 92;
    item.errorMessage = 'Aguardando confirmação do Firestore.';
    item.updatedAt = Date.now();
    await saveQueueItem(item);
    getAllQueueItems(userId).then(notifyListeners);
  }
}

/**
 * 5. CANCEL AND PURGE (The Definitive Fix for Record Deletions)
 *
 * When a user deletes a record:
 * - Marks tombstone to prevent any future re-upload or recreation.
 * - Cancels running Firebase Storage upload immediately.
 * - Deletes queue items from IndexedDB.
 * - Deletes binary blobs from IndexedDB.
 * - Removes from local storage cache.
 * - Deletes from Firestore and Storage if already present.
 */
export async function cancelAndPurgeRecordUpload(
  recordId: string,
  userId: string,
  attachments?: { storagePath?: string }[]
): Promise<void> {
  console.log(`[BACKGROUND QUEUE] Executando cancelamento e expurgo definitivo para: ${recordId}`);

  // 1. Mark as tombstone (persisted locally)
  addDeletedTombstone(recordId);

  // 2. Abort any active upload task
  const taskByRec = activeUploadTasks.get(recordId);
  if (taskByRec) {
    try {
      taskByRec.cancel();
    } catch {}
    activeUploadTasks.delete(recordId);
  }

  const queueId = `queue_${recordId}`;
  const taskByQueue = activeUploadTasks.get(queueId);
  if (taskByQueue) {
    try {
      taskByQueue.cancel();
    } catch {}
    activeUploadTasks.delete(queueId);
  }

  // 3. Purge from IndexedDB upload queue
  await deleteQueueItemsByRecordId(recordId);
  await deleteQueueItem(queueId);

  // 4. Purge local media blob from IndexedDB
  await deleteLocalMediaBlob(recordId);

  // 5. Remove from localStorage cached records
  try {
    const cacheKey = `diario_pessoal_records_cache_${userId}`;
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const list: DiaryRecord[] = JSON.parse(raw);
      const filtered = list.filter((r) => r.id !== recordId);
      localStorage.setItem(cacheKey, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('[BACKGROUND QUEUE] Cache purge warning:', e);
  }

  // 6. Delete from Firestore
  try {
    const docRef = doc(db, 'users', userId, 'records', recordId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('[BACKGROUND QUEUE] Firestore delete doc warning:', e);
  }

  // 7. Delete from Firebase Storage if storage paths exist
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.storagePath) {
        try {
          const sRef = storageRef(storage, att.storagePath);
          await deleteObject(sRef);
        } catch (e) {
          // ignore if already gone
        }
      }
    }
  }

  // 8. Notify UI listeners so badge/status updates instantly
  getAllQueueItems(userId).then(notifyListeners);
}

/**
 * 6. Retry a specific failed queue item (Resets retry count)
 */
export async function retryQueueItem(queueId: string, userId: string): Promise<void> {
  const item = await getQueueItem(queueId);
  if (!item) return;

  if (isDeletedTombstoned(item.recordId)) {
    await cancelAndPurgeRecordUpload(item.recordId, userId);
    return;
  }

  item.status = 'pending_upload';
  item.retryCount = 0;
  item.progress = 5;
  item.errorMessage = undefined;
  item.updatedAt = Date.now();
  await saveQueueItem(item);
  getAllQueueItems(userId).then(notifyListeners);

  processBackgroundUploadQueue(userId).catch(console.warn);
}

/**
 * 7. Cancel a specific queue item
 */
export async function cancelQueueItem(queueId: string, userId: string): Promise<void> {
  const item = await getQueueItem(queueId);
  if (item) {
    await cancelAndPurgeRecordUpload(item.recordId, userId);
  } else {
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
}

// Global Online Listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[BACKGROUND QUEUE] Conexão restabelecida. Retomando fila de uploads...');
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
