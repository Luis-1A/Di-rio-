/**
 * IndexedDB Storage Helper for Local Media Blobs & Background Upload Queue
 *
 * Provides:
 * 1. `media_blobs`: Large binary files (photos, videos, audio, PDFs) stored locally for instant zero-latency playback.
 * 2. `upload_queue`: Persistent queue for background Firebase Storage & Firestore syncing.
 */

import { BackgroundUploadItem } from '../types';

const DB_NAME = 'diario_pessoal_media_db';
const DB_VERSION = 2;
const BLOB_STORE = 'media_blobs';
const QUEUE_STORE = 'upload_queue';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'recordId' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('recordId', 'recordId', { unique: false });
        queueStore.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredMediaItem {
  recordId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  updatedAt: number;
}

// ----------------------------------------------------
// 1. Binary Media Blob Operations
// ----------------------------------------------------

export async function saveLocalMediaBlob(
  recordId: string,
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      const store = tx.objectStore(BLOB_STORE);
      const item: StoredMediaItem = {
        recordId,
        blob,
        fileName,
        mimeType,
        updatedAt: Date.now(),
      };
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning saving media blob:', e);
  }
}

export async function getLocalMediaBlob(
  recordId: string
): Promise<StoredMediaItem | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readonly');
      const store = tx.objectStore(BLOB_STORE);
      const req = store.get(recordId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning getting media blob:', e);
    return null;
  }
}

export async function deleteLocalMediaBlob(recordId: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      const store = tx.objectStore(BLOB_STORE);
      const req = store.delete(recordId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning deleting media blob:', e);
  }
}

// ----------------------------------------------------
// 2. Persistent Upload Queue Operations
// ----------------------------------------------------

export async function saveQueueItem(item: BackgroundUploadItem): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning saving queue item:', e);
  }
}

export async function getQueueItem(id: string): Promise<BackgroundUploadItem | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning getting queue item:', e);
    return null;
  }
}

export async function getQueueItemByRecordId(
  recordId: string
): Promise<BackgroundUploadItem | null> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const index = store.index('recordId');
      const req = index.get(recordId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning getting queue item by record ID:', e);
    return null;
  }
}

export async function getAllQueueItems(userId?: string): Promise<BackgroundUploadItem[]> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: BackgroundUploadItem[] = req.result || [];
        if (userId) {
          resolve(list.filter((item) => item.userId === userId));
        } else {
          resolve(list);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning getting all queue items:', e);
    return [];
  }
}

export async function deleteQueueItem(id: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning deleting queue item:', e);
  }
}

export async function deleteQueueItemsByRecordId(recordId: string): Promise<void> {
  try {
    const db = await openMediaDB();
    const items = await getAllQueueItems();
    const matching = items.filter((it) => it.recordId === recordId);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      for (const it of matching) {
        store.delete(it.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[IDB] Warning deleting queue items for recordId:', e);
  }
}

export async function clearFinishedQueueItems(userId: string): Promise<void> {
  try {
    const items = await getAllQueueItems(userId);
    const db = await openMediaDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    for (const it of items) {
      if (
        it.status === 'synced' ||
        it.status === 'completed' ||
        it.status === 'deleted' ||
        it.status === 'cancelled'
      ) {
        store.delete(it.id);
      }
    }
  } catch (e) {
    console.warn('[IDB] Warning clearing finished queue items:', e);
  }
}

// ----------------------------------------------------
// 3. Deleted Records Tombstone Store (Prevents Re-uploading)
// ----------------------------------------------------
const TOMBSTONE_STORAGE_KEY = 'diario_pessoal_tombstone_deleted_records';

export function addDeletedTombstone(recordId: string): void {
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY) || '[]';
    const list: string[] = JSON.parse(raw);
    if (!list.includes(recordId)) {
      list.push(recordId);
      // Keep max 500 recent tombstones
      const trimmed = list.slice(-500);
      localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch (e) {
    console.warn('[IDB] Tombstone store warning:', e);
  }
}

export function isDeletedTombstoned(recordId: string): boolean {
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY) || '[]';
    const list: string[] = JSON.parse(raw);
    return list.includes(recordId);
  } catch (e) {
    return false;
  }
}
