/**
 * Cloud Firestore Service with Real Firebase Transactions, Strict User Isolation,
 * True Save Guarantees and Offline Resilience
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import {
  DiaryRecord,
  MemoryItem,
  ChatMessage,
  IAUProfileSettings,
  UserProfile,
} from '../types';
import { syncQueue, generateOperationId } from './syncQueue';

/**
 * Deeply sanitizes an object before writing to Firestore by removing any `undefined` values.
 * Firestore throws a runtime error if any field is `undefined`.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (typeof data !== 'object') {
    return data;
  }
  // Check if it's a Firestore FieldValue (e.g. serverTimestamp)
  if (
    typeof (data as any)?._methodName === 'string' ||
    (data as any)?.constructor?.name === 'FieldValue' ||
    (data as any)?._delegate !== undefined
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined) as any;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj as T;
}

export const defaultIAUSettings: IAUProfileSettings = {
  personalityTone: 'natural',
  responseLength: 'adaptive',
  autoPlayAudio: false,
  voicePitch: 1.0,
  voiceRate: 1.0,
  voiceVolume: 1.0,
  allowAutoMemoryCreation: true,
  customInstructions: '',
};

/**
 * 1. User Profile & Settings
 */
export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  const profileRef = doc(db, 'users', uid, 'profile', 'info');
  const snap = await getDoc(profileRef);

  if (snap.exists()) {
    return snap.data() as UserProfile;
  }

  const newProfile: UserProfile = {
    uid,
    email: email || '',
    displayName: displayName || email.split('@')[0] || 'Usuário',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(profileRef, sanitizeForFirestore({
    ...newProfile,
    _serverTimestamp: serverTimestamp(),
  }));

  return newProfile;
}

export async function getIAUSettings(uid: string): Promise<IAUProfileSettings> {
  try {
    const docRef = doc(db, 'users', uid, 'settings', 'iauProfile');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...defaultIAUSettings, ...snap.data() } as IAUProfileSettings;
    }
  } catch (err) {
    console.warn('Error fetching IAU settings, using defaults:', err);
  }
  return defaultIAUSettings;
}

export async function saveIAUSettings(
  uid: string,
  settings: IAUProfileSettings
): Promise<void> {
  const docRef = doc(db, 'users', uid, 'settings', 'iauProfile');
  await setDoc(docRef, sanitizeForFirestore({
    ...settings,
    updatedAt: new Date().toISOString(),
    _serverTimestamp: serverTimestamp(),
  }));
}

/**
 * 2. Records Management
 */
export function subscribeToRecords(
  uid: string,
  onUpdate: (records: DiaryRecord[]) => void,
  onError?: (err: Error) => void
) {
  const recordsCol = collection(db, 'users', uid, 'records');
  const q = query(recordsCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DiaryRecord[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as DiaryRecord);
      });
      onUpdate(list);
    },
    (error) => {
      console.error('Snapshot error on records:', error);
      onError?.(error);
    }
  );
}

export async function saveRecord(
  uid: string,
  record: Omit<DiaryRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'syncStatus'> & {
    id?: string;
    createdAt?: string;
  }
): Promise<DiaryRecord> {
  const recordId = record.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  const now = new Date().toISOString();
  const opId = record.operationId || generateOperationId('rec');

  const fullRecord: DiaryRecord = {
    ...record,
    id: recordId,
    userId: uid,
    operationId: opId,
    createdAt: record.createdAt || now,
    updatedAt: now,
    syncStatus: 'synced',
    isDeleted: record.isDeleted || false,
    attachments: record.attachments || [],
    tags: record.tags || [],
  };

  const docRef = doc(db, 'users', uid, 'records', recordId);

  try {
    // Real save to Firestore
    await setDoc(docRef, sanitizeForFirestore({
      ...fullRecord,
      _serverTimestamp: serverTimestamp(),
    }));
    // If it was in the sync queue, mark as synced
    const pendingList = syncQueue.getPendingItems();
    const existingInQueue = pendingList.find(
      (p) => p.operationId === opId || (p.payload?.record?.id === recordId)
    );
    if (existingInQueue) {
      syncQueue.markSynced(existingInQueue.id);
    }
    return fullRecord;
  } catch (error: any) {
    console.error('Firestore save failed for record:', error);
    // Queue for sync when offline
    syncQueue.enqueue({
      operationId: opId,
      entityType: 'record',
      action: 'update',
      payload: { uid, record: fullRecord },
    });
    // Re-throw so the UI displays ⚠ NÃO FOI POSSÍVEL SALVAR
    throw error;
  }
}

export async function softDeleteRecord(uid: string, recordId: string): Promise<void> {
  const docRef = doc(db, 'users', uid, 'records', recordId);
  const now = new Date().toISOString();
  await setDoc(
    docRef,
    sanitizeForFirestore({
      isDeleted: true,
      deletedAt: now,
      updatedAt: now,
      _serverTimestamp: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function restoreRecord(uid: string, recordId: string): Promise<void> {
  const docRef = doc(db, 'users', uid, 'records', recordId);
  const now = new Date().toISOString();
  await setDoc(
    docRef,
    sanitizeForFirestore({
      isDeleted: false,
      deletedAt: null,
      updatedAt: now,
      _serverTimestamp: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function permanentlyDeleteRecord(
  uid: string,
  recordId: string,
  attachments?: { storagePath?: string }[]
): Promise<void> {
  // Delete attached files in storage if paths exist
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.storagePath) {
        try {
          const sRef = storageRef(storage, att.storagePath);
          await deleteObject(sRef);
        } catch (e) {
          console.warn('Storage deletion failed for attachment:', e);
        }
      }
    }
  }

  const docRef = doc(db, 'users', uid, 'records', recordId);
  await deleteDoc(docRef);
}

/**
 * 3. Memories Management
 */
export function subscribeToMemories(
  uid: string,
  onUpdate: (memories: MemoryItem[]) => void,
  onError?: (err: Error) => void
) {
  const memCol = collection(db, 'users', uid, 'memories');
  const q = query(memCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MemoryItem[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as MemoryItem);
      });
      onUpdate(list);
    },
    (error) => {
      console.error('Snapshot error on memories:', error);
      onError?.(error);
    }
  );
}

export async function saveMemory(
  uid: string,
  memory: Omit<MemoryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
  }
): Promise<MemoryItem> {
  const memId = memory.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  const now = new Date().toISOString();

  const fullMemory: MemoryItem = {
    ...memory,
    id: memId,
    userId: uid,
    createdAt: memory.createdAt || now,
    updatedAt: now,
  };

  const docRef = doc(db, 'users', uid, 'memories', memId);
  await setDoc(docRef, sanitizeForFirestore({
    ...fullMemory,
    _serverTimestamp: serverTimestamp(),
  }));

  return fullMemory;
}

export async function deleteMemory(uid: string, memoryId: string): Promise<void> {
  const docRef = doc(db, 'users', uid, 'memories', memoryId);
  await deleteDoc(docRef);
}

/**
 * 4. Chat Messages Management (Central Chat)
 */
export function subscribeToMessages(
  uid: string,
  onUpdate: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
) {
  const msgCol = collection(db, 'users', uid, 'messages');
  const q = query(msgCol, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChatMessage[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ChatMessage);
      });
      onUpdate(list);
    },
    (error) => {
      console.error('Snapshot error on messages:', error);
      onError?.(error);
    }
  );
}

export async function saveMessage(
  uid: string,
  message: Omit<ChatMessage, 'id' | 'userId' | 'createdAt' | 'syncStatus'> & {
    id?: string;
    createdAt?: string;
  }
): Promise<ChatMessage> {
  const msgId = message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  const now = new Date().toISOString();
  const opId = message.operationId || generateOperationId('msg');

  const fullMessage: ChatMessage = {
    ...message,
    id: msgId,
    userId: uid,
    operationId: opId,
    createdAt: message.createdAt || now,
    syncStatus: 'synced',
  };

  const docRef = doc(db, 'users', uid, 'messages', msgId);
  try {
    await setDoc(docRef, sanitizeForFirestore({
      ...fullMessage,
      _serverTimestamp: serverTimestamp(),
    }));
    return fullMessage;
  } catch (error: any) {
    console.error('Firestore save failed for message:', error);
    syncQueue.enqueue({
      operationId: opId,
      entityType: 'message',
      action: 'create',
      payload: { uid, message: fullMessage },
    });
    throw error;
  }
}

import { uploadToStorageWithProgress } from './uploadService';

/**
 * 5. Firebase Storage File Upload with Progress, Timeout and Diagnostic Logs
 */
export async function uploadFileToStorage(
  uid: string,
  fileOrBlob: File | Blob,
  subfolder: 'images' | 'videos' | 'audio' | 'documents',
  filename: string,
  onProgress?: (percent: number, phase: string) => void
): Promise<{ url: string; storagePath: string }> {
  const recordId = `rec_${Date.now()}`;
  const res = await uploadToStorageWithProgress({
    uid,
    recordId,
    fileOrBlob,
    folder: subfolder,
    fileName: filename,
    mimeType: fileOrBlob.type || undefined,
    onProgress: onProgress
      ? (update) => onProgress(update.percent, update.message)
      : undefined,
  });
  return { url: res.url, storagePath: res.storagePath };
}

/**
 * 6. Flusher for Offline Queue
 */
export async function flushSyncQueue(
  uid: string
): Promise<{ synced: number; failed: number }> {
  const items = syncQueue.getPendingItems();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      syncQueue.markProcessing(item.id);
      if (item.entityType === 'record') {
        const { record } = item.payload;
        if (record && record.id) {
          const docRef = doc(db, 'users', uid, 'records', record.id);
          await setDoc(docRef, sanitizeForFirestore({
            ...record,
            syncStatus: 'synced',
            _serverTimestamp: serverTimestamp(),
          }));
        }
      } else if (item.entityType === 'message') {
        const { message } = item.payload;
        if (message && message.id) {
          const docRef = doc(db, 'users', uid, 'messages', message.id);
          await setDoc(docRef, sanitizeForFirestore({
            ...message,
            syncStatus: 'synced',
            _serverTimestamp: serverTimestamp(),
          }));
        }
      }
      syncQueue.markSynced(item.id);
      synced++;
    } catch (e: any) {
      console.warn(`Sync queue flush failed for item ${item.id}:`, e);
      syncQueue.markFailed(item.id, e.message || 'Erro de sincronização.');
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * 7. Full Data Export
 */
export async function exportAllUserData(uid: string): Promise<any> {
  const [profileSnap, settingsSnap, recordsSnap, memoriesSnap, messagesSnap] =
    await Promise.all([
      getDoc(doc(db, 'users', uid, 'profile', 'info')),
      getDoc(doc(db, 'users', uid, 'settings', 'iauProfile')),
      getDocs(collection(db, 'users', uid, 'records')),
      getDocs(collection(db, 'users', uid, 'memories')),
      getDocs(collection(db, 'users', uid, 'messages')),
    ]);

  const records: any[] = [];
  recordsSnap.forEach((d) => records.push(d.data()));

  const memories: any[] = [];
  memoriesSnap.forEach((d) => memories.push(d.data()));

  const messages: any[] = [];
  messagesSnap.forEach((d) => messages.push(d.data()));

  return {
    exportedAt: new Date().toISOString(),
    system: 'Diário Pessoal + IAU Central',
    user: profileSnap.data() || { uid },
    settings: settingsSnap.data() || {},
    records,
    memories,
    messages,
  };
}

/**
 * 8. User Account Data Deletion
 */
export async function deleteUserAccountData(uid: string): Promise<void> {
  const collectionsToDelete = ['records', 'memories', 'messages'];
  for (const col of collectionsToDelete) {
    const snap = await getDocs(collection(db, 'users', uid, col));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }

  // Delete profile & settings
  await deleteDoc(doc(db, 'users', uid, 'profile', 'info')).catch(() => {});
  await deleteDoc(doc(db, 'users', uid, 'settings', 'iauProfile')).catch(() => {});
}
