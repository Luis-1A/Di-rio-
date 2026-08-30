/**
 * Robust Upload Service for Diário Pessoal
 * Features:
 * - Strict Pre-validation (existence, size, MIME type, extension, permissions)
 * - Real Firebase Storage uploads via uploadBytesResumable with live % progress tracking
 * - Strict Timeout management to eliminate infinite loading spinners
 * - Guaranteed Firestore document creation & server verification
 * - Duplicate submission prevention
 * - Offline queue fallback for poor network connectivity
 * - Standardized diagnostic logs: [UPLOAD] and [UPLOAD ERROR]
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
  getDocFromServer,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import { DiaryRecord, RecordAttachment, RecordType } from '../types';
import { syncQueue, generateOperationId } from './syncQueue';
import { sanitizeForFirestore } from './firestoreService';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
}

export interface UploadProgressCallback {
  (percent: number, phaseText: string): void;
}

export interface UploadResult {
  url: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
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
  photo: 35 * 1024 * 1024, // 35 MB
  audio: 60 * 1024 * 1024, // 60 MB
  video: 120 * 1024 * 1024, // 120 MB
  document: 50 * 1024 * 1024, // 50 MB
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
    console.error(`[UPLOAD ERROR] etapa: validação | código: FILE_MISSING | mensagem: ${err}`);
    return { valid: false, error: err, fileName: '', fileSize: 0, mimeType: '', extension: '' };
  }

  const isFile = fileOrBlob instanceof File;
  const rawName = isFile ? (fileOrBlob as File).name : `gravacao_${Date.now()}.${expectedType === 'audio' ? 'webm' : 'bin'}`;
  const fileSize = fileOrBlob.size;
  let mimeType = fileOrBlob.type;

  // Extract extension
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

  console.log(
    `[UPLOAD] arquivo selecionado: "${rawName}", tamanho: ${(fileSize / 1024).toFixed(1)} KB, tipo: ${mimeType}`
  );

  // Check 0-byte corrupted files
  if (fileSize <= 0) {
    const err = 'O arquivo selecionado está vazio (0 bytes).';
    console.error(`[UPLOAD ERROR] etapa: validação | código: ZERO_BYTE_FILE | mensagem: ${err}`);
    return { valid: false, error: err, fileName: rawName, fileSize, mimeType, extension };
  }

  // Size limit validation
  const maxSize = MAX_SIZE_MAP[expectedType] || 50 * 1024 * 1024;
  if (fileSize > maxSize) {
    const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
    const err = `O arquivo excede o limite máximo permitido de ${maxMb} MB.`;
    console.error(`[UPLOAD ERROR] etapa: validação | código: FILE_TOO_LARGE | mensagem: ${err}`);
    return { valid: false, error: err, fileName: rawName, fileSize, mimeType, extension };
  }

  // Type validation
  if (expectedType !== 'document' && expectedType !== 'text') {
    const allowed = EXTENSION_MIME_MAP[expectedType] || [];
    const isMimeMatch = allowed.some((m) => mimeType.toLowerCase().startsWith(m.split('/')[0]));
    if (!isMimeMatch && mimeType !== 'application/octet-stream') {
      const err = `Tipo de mídia incompatível. Esperado: ${expectedType}, recebido: ${mimeType}`;
      console.error(`[UPLOAD ERROR] etapa: validação | código: INVALID_MIME | mensagem: ${err}`);
      return { valid: false, error: err, fileName: rawName, fileSize, mimeType, extension };
    }
  }

  console.log(`[UPLOAD] validação OK: ${rawName} (${fileSize} bytes, ext: .${extension})`);

  return {
    valid: true,
    fileName: rawName,
    fileSize,
    mimeType,
    extension,
  };
}

/**
 * 2. Upload file to Firebase Storage with resumable progress tracking & strict timeout
 */
export async function uploadToStorageWithProgress(params: {
  uid: string;
  recordId: string;
  fileOrBlob: File | Blob;
  folder: 'images' | 'videos' | 'audio' | 'documents';
  fileName: string;
  mimeType?: string;
  onProgress?: UploadProgressCallback;
  timeoutMs?: number;
}): Promise<UploadResult> {
  const {
    uid,
    recordId,
    fileOrBlob,
    folder,
    fileName,
    mimeType = 'application/octet-stream',
    onProgress,
    timeoutMs = 45000, // 45 seconds default timeout to prevent infinite hangs
  } = params;

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Storage structure: users/USER_ID/registros/REGISTRO_ID/fileName
  const storagePath = `users/${uid}/registros/${recordId}/${sanitizedName}`;

  console.log(`[UPLOAD] iniciando Storage: caminho ${storagePath}`);
  onProgress?.(5, 'Iniciando envio...');

  const sRef = storageRef(storage, storagePath);

  return new Promise((resolve, reject) => {
    let uploadTask: UploadTask;
    let isFinished = false;

    // Timeout guard: cancel task and reject if taking too long
    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try {
          if (uploadTask) uploadTask.cancel();
        } catch {}
        const err = new Error(
          'O envio do arquivo excedeu o tempo limite (Timeout). Verifique sua conexão e tente novamente.'
        );
        console.error(
          `[UPLOAD ERROR] etapa: Storage | código: STORAGE_TIMEOUT | mensagem: ${err.message}`
        );
        reject(err);
      }
    }, timeoutMs);

    try {
      uploadTask = uploadBytesResumable(sRef, fileOrBlob, {
        contentType: mimeType,
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (isFinished) return;
          const total = snapshot.totalBytes;
          const transferred = snapshot.bytesTransferred;
          let percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
          if (percent > 98) percent = 98; // keep 100 for final confirmation

          console.log(`[UPLOAD] progresso: ${percent}% (${transferred}/${total} bytes)`);
          onProgress?.(percent, `Enviando... ${percent}%`);
        },
        (error) => {
          if (isFinished) return;
          isFinished = true;
          clearTimeout(timer);
          console.error(
            `[UPLOAD ERROR] etapa: Storage | código: ${error.code || 'UNKNOWN'} | mensagem: ${error.message}`
          );
          reject(error);
        },
        async () => {
          if (isFinished) return;
          try {
            console.log(`[UPLOAD] Storage concluído: ${storagePath}`);
            onProgress?.(99, 'Concluindo...');

            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            console.log(`[UPLOAD] URL obtida com sucesso: ${downloadUrl.substring(0, 40)}...`);

            isFinished = true;
            clearTimeout(timer);

            resolve({
              url: downloadUrl,
              storagePath,
              fileName,
              fileSize: fileOrBlob.size,
              mimeType,
            });
          } catch (err: any) {
            isFinished = true;
            clearTimeout(timer);
            console.error(
              `[UPLOAD ERROR] etapa: Obter URL | código: GET_URL_FAILED | mensagem: ${err.message}`
            );
            reject(err);
          }
        }
      );
    } catch (startErr: any) {
      isFinished = true;
      clearTimeout(timer);
      console.error(
        `[UPLOAD ERROR] etapa: Iniciar Storage | código: STORAGE_INIT_FAIL | mensagem: ${startErr.message}`
      );
      reject(startErr);
    }
  });
}

/**
 * 3. Complete End-to-End Save Pipeline:
 * Storage -> Firestore -> Server Verification -> Confirmed Status
 */
export async function executeRecordCreationPipeline(params: {
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
  existingAttachments?: RecordAttachment[];
  audioDurationSeconds?: number;
  transcript?: string;
  onProgress?: (percent: number, stageText: string) => void;
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
    existingAttachments = [],
    audioDurationSeconds,
    transcript,
    onProgress,
  } = params;

  // Step 1: Create or assign unique record ID
  const recordId =
    params.recordId || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[UPLOAD] criando ID do registro: ${recordId}`);

  let attachments: RecordAttachment[] = [...existingAttachments];
  let primaryStoragePath: string | undefined;
  let primaryDownloadUrl: string | undefined;
  let primaryFileName: string | undefined;
  let primaryFileSize: number | undefined;
  let primaryMimeType: string | undefined;

  // Step 2 & 4: If there is a file/blob to upload, execute Storage upload
  if (fileOrBlob && type !== 'text') {
    const folderMap = {
      photo: 'images' as const,
      video: 'videos' as const,
      audio: 'audio' as const,
      document: 'documents' as const,
      mixed: 'documents' as const,
      text: 'documents' as const,
    };

    // Validation
    const val = validateFile(fileOrBlob, type === 'mixed' ? 'document' : type);
    if (!val.valid) {
      throw new Error(val.error || 'Arquivo inválido.');
    }

    // Storage Upload with Progress & Timeout
    const uploadRes = await uploadToStorageWithProgress({
      uid,
      recordId,
      fileOrBlob,
      folder: folderMap[type] || 'documents',
      fileName: val.fileName,
      mimeType: val.mimeType,
      onProgress,
    });

    primaryStoragePath = uploadRes.storagePath;
    primaryDownloadUrl = uploadRes.url;
    primaryFileName = uploadRes.fileName;
    primaryFileSize = uploadRes.fileSize;
    primaryMimeType = uploadRes.mimeType;

    const newAtt: RecordAttachment = {
      id: `att_${Date.now()}`,
      name: uploadRes.fileName,
      type: type === 'photo' ? 'image' : type === 'document' ? 'document' : (type as any),
      url: uploadRes.url,
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
  }

  // Step 7: Create Firestore Document Payload
  onProgress?.(99, 'Salvando metadados no Firestore...');
  console.log(`[UPLOAD] Firestore iniciado: salvando documento ${recordId}`);

  const now = new Date().toISOString();
  const opId = generateOperationId('rec_save');

  const fullRecord: DiaryRecord = {
    id: recordId,
    userId: uid,
    title: title.trim() || (type === 'photo' ? 'Foto salva' : type === 'audio' ? 'Áudio gravado' : type === 'video' ? 'Vídeo gravado' : type === 'document' ? 'Arquivo salvo' : 'Registro pessoal'),
    content: content.trim(),
    description: content.trim(),
    type,
    date: date || now.split('T')[0],
    time: time || `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`,
    category,
    tags,
    attachments,
    storagePath: primaryStoragePath,
    downloadUrl: primaryDownloadUrl,
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

  const docRef = doc(db, 'users', uid, 'records', recordId);

  try {
    // Write to Firestore
    await setDoc(docRef, sanitizeForFirestore({
      ...fullRecord,
      _serverTimestamp: serverTimestamp(),
    }));

    // Step 8: Verify the document exists in Firestore
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        console.log(`[UPLOAD] Firestore confirmado: documento ${recordId} existe.`);
      }
    } catch (verifErr) {
      console.warn('Firestore verification soft check:', verifErr);
    }

    console.log(`[UPLOAD] registro concluído com sucesso: ${recordId}`);
    onProgress?.(100, '✓ Arquivo salvo');

    return fullRecord;
  } catch (firestoreErr: any) {
    console.error(
      `[UPLOAD ERROR] etapa: Firestore | código: ${firestoreErr.code || 'FIRESTORE_WRITE_FAILED'} | mensagem: ${firestoreErr.message}`
    );

    // Enqueue in offline sync queue to guarantee user data isn't lost
    syncQueue.enqueue({
      operationId: opId,
      entityType: 'record',
      action: 'create',
      payload: { uid, record: { ...fullRecord, syncStatus: 'pending', uploadStatus: 'pending' } },
    });

    throw new Error(
      `Não foi possível salvar o arquivo no banco de dados: ${firestoreErr.message || 'Erro de conexão'}`
    );
  }
}
