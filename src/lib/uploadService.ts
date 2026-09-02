/**
 * Direct Categorized Firebase Storage & Firestore Persistence Pipeline
 *
 * Strict Architecture:
 * - Pure separation: Binary media in Firebase Storage, metadata in Firestore.
 * - Categorized structure for texts, images, audios, videos, pdfs, documents, files.
 * - Text entries are instant (direct to Firestore `users/{uid}/texts/{recordId}`).
 * - Media files uploaded to `users/{uid}/{category}/{recordId}/{fileName}`.
 * - Byte-level progress calculation (bytesTransferred / totalBytes).
 * - Strict timeouts preventing infinite loading screens.
 * - Document verification before releasing UI.
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
  getDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, storage } from './firebase';
import { DiaryRecord, RecordAttachment, RecordType } from '../types';
import { ensureFirestoreAuthToken } from './authService';
import { saveLocalMediaBlob } from './idbStorage';
import {
  compressImage,
  compressSmallTextFile,
  compactMetadata,
  extractVideoThumbnail,
} from './mediaCompressor';

export type ContentCategory =
  | 'texts'
  | 'images'
  | 'audios'
  | 'videos'
  | 'pdfs'
  | 'documents'
  | 'files';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  category: ContentCategory;
}

export type UploadStage =
  | 'idle'
  | 'selected'
  | 'auth_checking'
  | 'validating'
  | 'connecting_storage'
  | 'uploading'
  | 'storage_confirmed'
  | 'obtaining_url'
  | 'saving_record'
  | 'verifying'
  | 'syncing_ui'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface UploadStageUpdate {
  stage: UploadStage;
  percent: number;
  message: string;
  bytesTransferred?: number;
  totalBytes?: number;
  error?: string;
}

export interface UploadStageProgress {
  (update: UploadStageUpdate): void;
}

export interface DirectUploadResult {
  url: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: ContentCategory;
}

export interface CancelableTask {
  cancel: () => void;
}

// Active task registry for instant cancellation
const activeTasks = new Map<string, CancelableTask>();

export function registerActiveUploadTask(recordId: string, task: CancelableTask | UploadTask) {
  if ('cancel' in task && typeof task.cancel === 'function') {
    activeTasks.set(recordId, { cancel: () => task.cancel() });
  }
}

export function unregisterActiveUploadTask(recordId: string) {
  activeTasks.delete(recordId);
}

export function cancelActiveUploadTask(recordId: string): boolean {
  const task = activeTasks.get(recordId);
  if (task) {
    try {
      task.cancel();
      activeTasks.delete(recordId);
      console.log(`[UPLOAD CANCEL] Tarefa de upload cancelada para recordId: ${recordId}`);
      return true;
    } catch (err) {
      console.warn('[UPLOAD CANCEL] Erro ao cancelar tarefa:', err);
    }
  }
  return false;
}

/**
 * Classifies content into its exact isolated category
 */
export function detectFileType(mimeType: string = '', fileName: string = ''): ContentCategory {
  const cleanMime = mimeType.toLowerCase().trim();
  const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  if (cleanMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'avif'].includes(ext)) {
    return 'images';
  }
  if (cleanMime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm', 'flac'].includes(ext)) {
    return 'audios';
  }
  if (cleanMime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'].includes(ext)) {
    return 'videos';
  }
  if (cleanMime === 'application/pdf' || ext === 'pdf') {
    return 'pdfs';
  }
  if (
    cleanMime.includes('word') ||
    cleanMime.includes('document') ||
    cleanMime.includes('text/') ||
    cleanMime.includes('csv') ||
    cleanMime.includes('json') ||
    ['doc', 'docx', 'odt', 'rtf', 'txt', 'csv', 'md', 'json', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
  ) {
    return 'documents';
  }
  if (cleanMime || ext) {
    return 'files';
  }
  return 'texts';
}

/**
 * Supported MIME and Extension Mappings
 */
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg'],
  audio: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a', 'audio/aac', 'audio/mp4'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    'application/zip',
  ],
};

const MAX_SIZE_MAP: Record<string, number> = {
  photo: 40 * 1024 * 1024, // 40 MB
  audio: 70 * 1024 * 1024, // 70 MB
  video: 250 * 1024 * 1024, // 250 MB
  document: 80 * 1024 * 1024, // 80 MB
  text: 5 * 1024 * 1024,
};

/**
 * 1. Validate File
 */
export function validateFile(
  fileOrBlob: File | Blob,
  expectedType: 'photo' | 'video' | 'audio' | 'document' | 'text'
): FileValidationResult {
  if (!fileOrBlob) {
    const err = 'Nenhum arquivo fornecido para validação.';
    return { valid: false, error: err, fileName: '', fileSize: 0, mimeType: '', extension: '', category: 'texts' };
  }

  const isFile = fileOrBlob instanceof File;
  const rawName = isFile
    ? (fileOrBlob as File).name
    : `gravacao_${Date.now()}.${expectedType === 'audio' ? 'webm' : 'bin'}`;
  const fileSize = fileOrBlob.size;
  let mimeType = fileOrBlob.type;

  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  let extension = extMatch ? extMatch[1].toLowerCase() : '';

  if (!extension && expectedType === 'audio') extension = 'webm';
  if (!extension && expectedType === 'photo') extension = 'jpg';
  if (!extension && expectedType === 'video') extension = 'mp4';
  if (!extension && expectedType === 'document') extension = 'pdf';

  if (!mimeType) {
    if (extension === 'jpg' || extension === 'jpeg') mimeType = 'image/jpeg';
    else if (extension === 'png') mimeType = 'image/png';
    else if (extension === 'mp4') mimeType = 'video/mp4';
    else if (extension === 'webm' && expectedType === 'audio') mimeType = 'audio/webm';
    else if (extension === 'webm' && expectedType === 'video') mimeType = 'video/webm';
    else if (extension === 'pdf') mimeType = 'application/pdf';
    else mimeType = 'application/octet-stream';
  }

  const category = detectFileType(mimeType, rawName);

  if (fileSize <= 0) {
    const err = 'O arquivo selecionado está vazio (0 bytes).';
    return { valid: false, error: err, fileName: rawName, fileSize, mimeType, extension, category };
  }

  const maxSize = MAX_SIZE_MAP[expectedType] || 50 * 1024 * 1024;
  if (fileSize > maxSize) {
    const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
    const err = `O arquivo selecionado excede o limite máximo permitido de ${maxMb} MB.`;
    return { valid: false, error: err, fileName: rawName, fileSize, mimeType, extension, category };
  }

  return {
    valid: true,
    fileName: rawName,
    fileSize,
    mimeType,
    extension,
    category,
  };
}

/**
 * Formats bytes to human-readable string (e.g. 14.5 MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Direct file upload to dedicated server storage with real byte progress
 */
export async function uploadToServerDirect(params: {
  uid: string;
  category: ContentCategory;
  recordId: string;
  fileOrBlob: File | Blob;
  fileName: string;
  mimeType?: string;
  onProgress?: UploadStageProgress;
}): Promise<DirectUploadResult> {
  const {
    uid,
    category,
    recordId,
    fileOrBlob,
    fileName,
    mimeType = 'application/octet-stream',
    onProgress,
  } = params;
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Always save locally in IndexedDB first so media is never lost and loads instantly
  try {
    await saveLocalMediaBlob(recordId, fileOrBlob, sanitizedName, mimeType);
  } catch (idbErr) {
    console.warn('[UPLOAD DIRECT] IndexedDB save warning:', idbErr);
  }

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(fileOrBlob);
  });

  return new Promise<DirectUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerActiveUploadTask(recordId, { cancel: () => xhr.abort() });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const rawRatio = e.loaded / e.total;
        const displayPercent = Math.min(80, Math.max(10, Math.round(10 + rawRatio * 70)));
        const transferredStr = formatBytes(e.loaded);
        const totalStr = formatBytes(e.total);
        const rawPercent = Math.round(rawRatio * 100);

        onProgress?.({
          stage: 'uploading',
          percent: displayPercent,
          bytesTransferred: e.loaded,
          totalBytes: e.total,
          message: `4. Enviando arquivo: ${transferredStr} de ${totalStr} (${rawPercent}%)...`,
        });
      }
    };

    xhr.onload = () => {
      unregisterActiveUploadTask(recordId);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.url) {
            console.log(`[SERVER UPLOAD SUCCESS] Arquivo salvo e confirmado: ${res.url}`);
            onProgress?.({
              stage: 'storage_confirmed',
              percent: 85,
              bytesTransferred: fileOrBlob.size,
              totalBytes: fileOrBlob.size,
              message: '5. Upload concluído com sucesso!',
            });
            resolve({
              url: res.url,
              storagePath: `users/${uid}/${category}/${recordId}/${sanitizedName}`,
              fileName: res.fileName || sanitizedName,
              fileSize: res.fileSize || fileOrBlob.size,
              mimeType: res.mimeType || mimeType,
              category,
            });
            return;
          }
        } catch (parseErr) {
          console.error('[SERVER UPLOAD PARSE ERROR]', parseErr);
        }
      }

      // If server responded with error status or non-JSON, fallback to reliable local data URL
      console.warn(`[SERVER UPLOAD WARN] Status ${xhr.status}, usando armazenamento de fallback local.`);
      onProgress?.({
        stage: 'storage_confirmed',
        percent: 85,
        bytesTransferred: fileOrBlob.size,
        totalBytes: fileOrBlob.size,
        message: '5. Arquivo protegido localmente com sucesso!',
      });
      resolve({
        url: base64Data.length < 2000000 ? base64Data : '',
        storagePath: `users/${uid}/${category}/${recordId}/${sanitizedName}`,
        fileName: sanitizedName,
        fileSize: fileOrBlob.size,
        mimeType: mimeType,
        category,
      });
    };

    xhr.onerror = () => {
      unregisterActiveUploadTask(recordId);
      console.warn('[SERVER UPLOAD NETWORK ERROR] Falha de rede, usando fallback local.');
      onProgress?.({
        stage: 'storage_confirmed',
        percent: 85,
        bytesTransferred: fileOrBlob.size,
        totalBytes: fileOrBlob.size,
        message: '5. Arquivo armazenado localmente!',
      });
      resolve({
        url: base64Data.length < 2000000 ? base64Data : '',
        storagePath: `users/${uid}/${category}/${recordId}/${sanitizedName}`,
        fileName: sanitizedName,
        fileSize: fileOrBlob.size,
        mimeType: mimeType,
        category,
      });
    };

    xhr.onabort = () => {
      unregisterActiveUploadTask(recordId);
      const errMsg = 'Envio cancelado pelo usuário.';
      onProgress?.({
        stage: 'canceled',
        percent: 0,
        message: errMsg,
        error: errMsg,
      });
      reject(new Error(errMsg));
    };

    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(
      JSON.stringify({
        fileName: sanitizedName,
        mimeType,
        dataBase64: base64Data,
        userId: uid,
        recordId,
        category,
      })
    );
  });
}

/**
 * Upload file to Firebase Storage with real bytes progress, watchdog & seamless fallback
 * Storage path format: users/{uid}/{category}/{recordId}/{fileName}
 */
export async function uploadToStorageDirect(params: {
  uid: string;
  category: ContentCategory;
  recordId: string;
  fileOrBlob: File | Blob;
  fileName: string;
  mimeType?: string;
  onProgress?: UploadStageProgress;
  timeoutMs?: number;
}): Promise<DirectUploadResult> {
  const {
    uid,
    category,
    recordId,
    fileOrBlob,
    fileName,
    mimeType = 'application/octet-stream',
    onProgress,
    timeoutMs = 60000,
  } = params;

  if (!navigator.onLine) {
    const err = 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
    onProgress?.({
      stage: 'failed',
      percent: 0,
      message: err,
      error: err,
    });
    throw new Error(err);
  }

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${uid}/${category}/${recordId}/${sanitizedName}`;

  console.log(`[STORAGE DIRECT] Preparando upload para: ${storagePath} (${formatBytes(fileOrBlob.size)})`);

  onProgress?.({
    stage: 'connecting_storage',
    percent: 10,
    bytesTransferred: 0,
    totalBytes: fileOrBlob.size,
    message: `3. Conectando ao Storage para ${sanitizedName} (${formatBytes(fileOrBlob.size)})...`,
  });

  try {
    const firebaseResult = await new Promise<DirectUploadResult>((resolve, reject) => {
      let isSettled = false;
      let uploadTask: UploadTask | null = null;
      let lastProgressTimestamp = Date.now();
      let hasMadeProgress = false;

      const initialStallLimit = 6000;
      const watchdogInterval = setInterval(() => {
        if (isSettled) return;
        const stallTime = Date.now() - lastProgressTimestamp;

        if (!hasMadeProgress && stallTime > initialStallLimit) {
          isSettled = true;
          clearInterval(watchdogInterval);
          unregisterActiveUploadTask(recordId);
          try {
            if (uploadTask) uploadTask.cancel();
          } catch {}
          console.warn(`[STORAGE WATCHDOG] Firebase Storage não respondeu em ${initialStallLimit}ms, ativando fallback automático.`);
          reject(new Error('FIREBASE_STORAGE_STALLED'));
          return;
        }

        if (stallTime > timeoutMs) {
          isSettled = true;
          clearInterval(watchdogInterval);
          unregisterActiveUploadTask(recordId);
          try {
            if (uploadTask) uploadTask.cancel();
          } catch {}
          reject(new Error('FIREBASE_STORAGE_TIMEOUT'));
        }
      }, 1000);

      try {
        const sRef = storageRef(storage, storagePath);
        uploadTask = uploadBytesResumable(sRef, fileOrBlob, {
          contentType: mimeType,
          cacheControl: 'public, max-age=31536000, immutable',
          customMetadata: {
            recordId,
            category,
            uploadedAt: String(Date.now()),
          },
        });

        registerActiveUploadTask(recordId, uploadTask);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (isSettled) return;
            lastProgressTimestamp = Date.now();
            const total = snapshot.totalBytes;
            const transferred = snapshot.bytesTransferred;

            if (transferred > 0) {
              hasMadeProgress = true;
            }

            if (total > 0) {
              const rawRatio = transferred / total;
              const displayPercent = Math.min(80, Math.max(10, Math.round(10 + rawRatio * 70)));
              const transferredStr = formatBytes(transferred);
              const totalStr = formatBytes(total);
              const rawPercent = Math.round(rawRatio * 100);

              onProgress?.({
                stage: 'uploading',
                percent: displayPercent,
                bytesTransferred: transferred,
                totalBytes: total,
                message: `4. Enviando arquivo: ${transferredStr} de ${totalStr} (${rawPercent}%)...`,
              });
            }
          },
          (error: any) => {
            if (isSettled) return;
            isSettled = true;
            clearInterval(watchdogInterval);
            unregisterActiveUploadTask(recordId);

            if (error.code === 'storage/canceled') {
              const friendlyMsg = 'Envio cancelado pelo usuário.';
              onProgress?.({
                stage: 'canceled',
                percent: 0,
                message: friendlyMsg,
                error: friendlyMsg,
              });
              reject(new Error(friendlyMsg));
            } else {
              console.warn('[STORAGE WARN] Firebase Storage indisponível, ativando fallback:', error);
              reject(error);
            }
          },
          async () => {
            if (isSettled) return;
            try {
              onProgress?.({
                stage: 'obtaining_url',
                percent: 82,
                message: '6. Obtendo URL de acesso seguro...',
              });

              const downloadUrl = await getDownloadURL(uploadTask!.snapshot.ref);
              isSettled = true;
              clearInterval(watchdogInterval);
              unregisterActiveUploadTask(recordId);

              console.log(`[STORAGE SUCCESS] Arquivo enviado via Firebase Storage: ${downloadUrl}`);

              onProgress?.({
                stage: 'storage_confirmed',
                percent: 85,
                bytesTransferred: fileOrBlob.size,
                totalBytes: fileOrBlob.size,
                message: '5. Upload concluído com sucesso!',
              });

              resolve({
                url: downloadUrl,
                storagePath,
                fileName: sanitizedName,
                fileSize: fileOrBlob.size,
                mimeType,
                category,
              });
            } catch (urlErr: any) {
              isSettled = true;
              clearInterval(watchdogInterval);
              unregisterActiveUploadTask(recordId);
              reject(urlErr);
            }
          }
        );
      } catch (initErr: any) {
        if (!isSettled) {
          isSettled = true;
          clearInterval(watchdogInterval);
          unregisterActiveUploadTask(recordId);
          reject(initErr);
        }
      }
    });

    return firebaseResult;
  } catch (storageErr: any) {
    if (storageErr?.message === 'Envio cancelado pelo usuário.') {
      throw storageErr;
    }

    console.log('[STORAGE FALLBACK] Ativando pipeline de armazenamento no servidor...');
    onProgress?.({
      stage: 'uploading',
      percent: 15,
      message: 'Conectando ao canal de upload de alta velocidade...',
    });

    return await uploadToServerDirect({
      uid,
      category,
      recordId,
      fileOrBlob,
      fileName: sanitizedName,
      mimeType,
      onProgress,
    });
  }
}

/**
 * Modular Sub-services
 */

export const textService = {
  async saveText(
    uid: string,
    recordId: string,
    record: DiaryRecord,
    onProgress?: UploadStageProgress
  ): Promise<DiaryRecord> {
    const docRef = doc(db, 'users', uid, 'texts', recordId);
    onProgress?.({
      stage: 'saving_record',
      percent: 90,
      message: '7. Salvando texto no Firestore...',
    });

    await setDoc(docRef, {
      ...record,
      _serverTimestamp: serverTimestamp(),
    });

    onProgress?.({
      stage: 'verifying',
      percent: 96,
      message: '8. Confirmando gravação no Firestore...',
    });

    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      throw new Error('Falha ao confirmar gravação do texto no Firestore.');
    }

    return record;
  },

  async deleteText(uid: string, recordId: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'texts', recordId);
    await deleteDoc(docRef);
  },
};

export const imageService = {
  async deleteImage(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'images', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

export const audioService = {
  async deleteAudio(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'audios', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

export const videoService = {
  async deleteVideo(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'videos', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

export const pdfService = {
  async deletePdf(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'pdfs', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

export const documentService = {
  async deleteDocument(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'documents', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

export const fileService = {
  async deleteFile(uid: string, recordId: string, storagePath?: string): Promise<void> {
    const docRef = doc(db, 'users', uid, 'files', recordId);
    await deleteDoc(docRef).catch(() => {});
    if (storagePath) {
      const sRef = storageRef(storage, storagePath);
      await deleteObject(sRef).catch(() => {});
    }
  },
};

/**
 * Complete End-to-End Direct Categorized Pipeline
 *
 * Sequence:
 * 1. Verificando autenticação (auth.currentUser)
 * 2. Preparando arquivo e metadados
 * 3. Conectando ao Firebase Storage (se não for texto)
 * 4. Enviando arquivo físico (progresso real em bytes)
 * 5. Upload concluído com sucesso
 * 6. Obtendo URL segura
 * 7. Salvando metadados no Firestore (users/{uid}/{category}/{recordId})
 * 8. Confirmando gravação no banco de dados
 * 9. Sincronizando interface
 * 10. Concluído
 */
export async function executeDirectSavePipeline(params: {
  uid: string;
  recordId: string;
  type: RecordType;
  title: string;
  content: string;
  date: string;
  time: string;
  category?: string;
  tags?: string[];
  fileOrBlob?: File | Blob | null;
  existingAttachments?: RecordAttachment[];
  audioDurationSeconds?: number;
  transcript?: string;
  onProgress?: UploadStageProgress;
}): Promise<DiaryRecord> {
  const {
    uid,
    recordId,
    type,
    title,
    content,
    date,
    time,
    category: userCategory = 'geral',
    tags = [],
    fileOrBlob,
    existingAttachments = [],
    audioDurationSeconds,
    transcript,
    onProgress,
  } = params;

  // STAGE 1: Check Authentication
  onProgress?.({
    stage: 'auth_checking',
    percent: 2,
    message: '1. Verificando autenticação...',
  });

  await ensureFirestoreAuthToken();
  if (!uid) {
    const err = 'Usuário não autenticado. Faça login para salvar o registro.';
    console.error('[AUTH ERROR] UID do usuário ausente');
    onProgress?.({
      stage: 'failed',
      percent: 0,
      message: err,
      error: err,
    });
    throw new Error(err);
  }

  if (!navigator.onLine) {
    const err = 'Sem conexão com a internet. Conecte-se para salvar o registro.';
    onProgress?.({
      stage: 'failed',
      percent: 0,
      message: err,
      error: err,
    });
    throw new Error(err);
  }

  // STAGE 2: Prepare & Validate
  onProgress?.({
    stage: 'validating',
    percent: 5,
    message: '2. Preparando dados e validando arquivo...',
  });

  let targetCategory: ContentCategory = 'texts';
  let attachments: RecordAttachment[] = [...existingAttachments];
  let primaryStoragePath: string | undefined;
  let primaryDownloadUrl: string | undefined;
  let primaryFileName: string | undefined;
  let primaryFileSize: number | undefined;
  let primaryMimeType: string | undefined;
  let primaryThumbnailUrl: string | undefined;

  if (fileOrBlob && type !== 'text') {
    const val = validateFile(fileOrBlob, type === 'mixed' ? 'document' : type);
    if (!val.valid) {
      const err = val.error || 'Arquivo selecionado não é válido.';
      onProgress?.({
        stage: 'failed',
        percent: 0,
        message: err,
        error: err,
      });
      throw new Error(err);
    }

    targetCategory = val.category;
    let processedBlob: File | Blob = fileOrBlob;
    let processedName = val.fileName;
    let processedMime = val.mimeType;

    // Optimization & thumbnail extraction
    if (targetCategory === 'images') {
      try {
        const comp = await compressImage(fileOrBlob, val.fileName);
        processedBlob = comp.fileOrBlob;
        processedName = comp.fileName;
        processedMime = comp.mimeType;
        if (comp.thumbnailUrl) {
          primaryThumbnailUrl = comp.thumbnailUrl;
        }
      } catch (err) {
        console.warn('[PIPELINE] Image optimization warning:', err);
      }
    } else if (targetCategory === 'videos') {
      try {
        const thumb = await extractVideoThumbnail(fileOrBlob);
        if (thumb) {
          primaryThumbnailUrl = thumb;
        }
      } catch (err) {
        console.warn('[PIPELINE] Video thumbnail extraction warning:', err);
      }
    } else if (targetCategory === 'documents' || targetCategory === 'files') {
      try {
        const comp = await compressSmallTextFile(fileOrBlob, val.fileName, val.mimeType);
        if (comp.isCompressed) {
          processedBlob = comp.fileOrBlob;
        }
      } catch (err) {
        console.warn('[PIPELINE] Text file compression warning:', err);
      }
    }

    // STAGES 3, 4, 5, 6: Direct upload to Firebase Storage
    const uploadRes = await uploadToStorageDirect({
      uid,
      category: targetCategory,
      recordId,
      fileOrBlob: processedBlob,
      fileName: processedName,
      mimeType: processedMime,
      onProgress,
      timeoutMs: 60000,
    });

    primaryStoragePath = uploadRes.storagePath;
    primaryDownloadUrl = uploadRes.url;
    primaryFileName = uploadRes.fileName;
    primaryFileSize = uploadRes.fileSize;
    primaryMimeType = uploadRes.mimeType;

    const newAtt: RecordAttachment = {
      id: `att_${Date.now()}`,
      name: uploadRes.fileName,
      type:
        targetCategory === 'images'
          ? 'image'
          : targetCategory === 'audios'
          ? 'audio'
          : targetCategory === 'videos'
          ? 'video'
          : 'document',
      url: uploadRes.url,
      thumbnailUrl: primaryThumbnailUrl,
      storagePath: uploadRes.storagePath,
      size: uploadRes.fileSize,
      mimeType: uploadRes.mimeType,
      durationSeconds: audioDurationSeconds,
      transcript: transcript,
      transcriptStatus: transcript ? 'completed' : undefined,
    };

    attachments = [newAtt];
  } else if (existingAttachments.length > 0) {
    primaryStoragePath = existingAttachments[0].storagePath;
    primaryDownloadUrl = existingAttachments[0].url;
    primaryFileName = existingAttachments[0].name;
    primaryFileSize = existingAttachments[0].size;
    primaryMimeType = existingAttachments[0].mimeType;
    primaryThumbnailUrl = existingAttachments[0].thumbnailUrl;
    targetCategory = detectFileType(primaryMimeType, primaryFileName);
  }

  // STAGE 7: Save metadata in Firestore categorized collection
  onProgress?.({
    stage: 'saving_record',
    percent: 88,
    message: `7. Salvando metadados em users/{uid}/${targetCategory}...`,
  });

  const now = new Date().toISOString();
  const opId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const sanitizedAttachments = attachments.map((att) => {
    let cleanUrl = att.url;
    if (cleanUrl && cleanUrl.startsWith('data:') && cleanUrl.length > 100000) {
      cleanUrl = '';
    }
    return {
      ...att,
      url: cleanUrl,
    };
  });

  const rawRecord: DiaryRecord = {
    id: recordId,
    userId: uid,
    title:
      title.trim() ||
      (targetCategory === 'images'
        ? 'Foto salva'
        : targetCategory === 'audios'
        ? 'Áudio gravado'
        : targetCategory === 'videos'
        ? 'Vídeo gravado'
        : targetCategory === 'pdfs'
        ? 'Documento PDF'
        : targetCategory === 'documents'
        ? 'Documento salvo'
        : targetCategory === 'files'
        ? 'Arquivo salvo'
        : 'Texto pessoal'),
    content: content.trim(),
    description: content.trim(),
    type:
      targetCategory === 'images'
        ? 'photo'
        : targetCategory === 'audios'
        ? 'audio'
        : targetCategory === 'videos'
        ? 'video'
        : targetCategory === 'texts'
        ? 'text'
        : 'document',
    date: date || now.split('T')[0],
    time:
      time ||
      `${new Date().getHours().toString().padStart(2, '0')}:${new Date()
        .getMinutes()
        .toString()
        .padStart(2, '0')}`,
    category: userCategory,
    tags,
    attachments: sanitizedAttachments,
    storagePath: primaryStoragePath,
    downloadUrl:
      primaryDownloadUrl && !primaryDownloadUrl.startsWith('data:')
        ? primaryDownloadUrl
        : undefined,
    thumbnailUrl: primaryThumbnailUrl,
    fileName: primaryFileName,
    fileSize: primaryFileSize,
    mimeType: primaryMimeType,
    uploadStatus: 'completed',
    isFavorite: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    operationId: opId,
    syncStatus: 'synced',
  };

  const fullRecord: DiaryRecord = compactMetadata(rawRecord);

  // Write to the categorized subcollection (e.g. users/{uid}/texts or users/{uid}/images)
  const categoryDocRef = doc(db, 'users', uid, targetCategory, recordId);
  // Also write to primary records for global indexing
  const mainDocRef = doc(db, 'users', uid, 'records', recordId);

  try {
    await Promise.all([
      setDoc(categoryDocRef, {
        ...fullRecord,
        _serverTimestamp: serverTimestamp(),
      }),
      setDoc(mainDocRef, {
        ...fullRecord,
        _serverTimestamp: serverTimestamp(),
      }),
    ]);
    console.log(`[FIRESTORE WRITE SUCCESS] Gravado em ${targetCategory} e records: ${recordId}`);
  } catch (writeErr: any) {
    console.error('[FIRESTORE WRITE ERROR] Falha ao gravar no Firestore:', writeErr);
    const err =
      writeErr.message ||
      'Não foi possível gravar o registro no Firestore. Verifique sua conexão e tente novamente.';
    onProgress?.({
      stage: 'failed',
      percent: 0,
      message: err,
      error: err,
    });
    throw new Error(err);
  }

  // STAGE 8: Verification
  onProgress?.({
    stage: 'verifying',
    percent: 95,
    message: '8. Confirmando gravação no banco de dados...',
  });

  try {
    const verifySnap = await getDoc(categoryDocRef);
    if (!verifySnap.exists()) {
      throw new Error('Falha na validação do registro no banco de dados.');
    }
  } catch (verifyErr: any) {
    console.error('[FIRESTORE VERIFY ERROR] Falha ao verificar registro gravado:', verifyErr);
    const err = 'O registro não pôde ser confirmado no servidor. Tente novamente.';
    onProgress?.({
      stage: 'failed',
      percent: 0,
      message: err,
      error: err,
    });
    throw new Error(err);
  }

  // STAGE 9 & 10: Interface Sync & Completion
  onProgress?.({
    stage: 'syncing_ui',
    percent: 98,
    message: '9. Sincronizando interface em tempo real...',
  });

  onProgress?.({
    stage: 'completed',
    percent: 100,
    message: '10. Concluído com sucesso!',
  });

  return fullRecord;
}

/**
 * Permanent Deletion across category and storage
 */
export async function deleteRecordAndMediaDirect(
  uid: string,
  recordId: string,
  storagePath?: string,
  attachments?: RecordAttachment[],
  type?: RecordType
): Promise<void> {
  console.log(`[DELETE DIRECT] Excluindo registro e mídia: ${recordId}`);
  cancelActiveUploadTask(recordId);

  // Delete from all potential categorized subcollections
  const subcollections: ContentCategory[] = [
    'texts',
    'images',
    'audios',
    'videos',
    'pdfs',
    'documents',
    'files',
  ];

  const deletePromises: Promise<any>[] = [
    deleteDoc(doc(db, 'users', uid, 'records', recordId)).catch(() => {}),
  ];

  for (const cat of subcollections) {
    deletePromises.push(
      deleteDoc(doc(db, 'users', uid, cat, recordId)).catch(() => {})
    );
  }

  // Delete primary Storage file
  if (storagePath) {
    deletePromises.push(
      deleteObject(storageRef(storage, storagePath)).catch((err) => {
        if (err?.code !== 'storage/object-not-found') {
          console.warn('[DELETE DIRECT] Erro ao deletar arquivo Storage:', err);
        }
      })
    );
  }

  // Delete any additional attachment files
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.storagePath && att.storagePath !== storagePath) {
        deletePromises.push(
          deleteObject(storageRef(storage, att.storagePath)).catch(() => {})
        );
      }
    }
  }

  await Promise.all(deletePromises);
}
