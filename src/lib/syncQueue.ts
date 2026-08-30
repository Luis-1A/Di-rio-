/**
 * Offline Sync Queue with OperationId Deduplication and Resilient Flushing
 */

import { SyncQueueItem } from '../types';

const SYNC_STORAGE_KEY = 'diario_pessoal_sync_queue';

export class SyncQueueManager {
  private queue: SyncQueueItem[] = [];
  private isProcessing: boolean = false;
  private listeners: ((queue: SyncQueueItem[]) => void)[] = [];

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkRestore());
    }
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(SYNC_STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to load sync queue from storage:', e);
      this.queue = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(this.queue));
      this.notifyListeners();
    } catch (e) {
      console.warn('Failed to persist sync queue:', e);
    }
  }

  subscribe(listener: (queue: SyncQueueItem[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.queue]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    const copy = [...this.queue];
    this.listeners.forEach((l) => l(copy));
  }

  enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries' | 'status'>): string {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullItem: SyncQueueItem = {
      ...item,
      id,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    // Check if operationId already exists in queue to avoid duplication
    const existingIndex = this.queue.findIndex(
      (q) => q.operationId === item.operationId
    );
    if (existingIndex >= 0) {
      this.queue[existingIndex] = fullItem;
    } else {
      this.queue.push(fullItem);
    }

    this.saveToStorage();
    return id;
  }

  markProcessing(id: string) {
    const item = this.queue.find((q) => q.id === id);
    if (item) {
      item.status = 'processing';
      this.saveToStorage();
    }
  }

  markSynced(id: string) {
    this.queue = this.queue.filter((q) => q.id !== id);
    this.saveToStorage();
  }

  markFailed(id: string, errorMessage: string) {
    const item = this.queue.find((q) => q.id === id);
    if (item) {
      item.status = 'failed';
      item.retries += 1;
      item.errorMessage = errorMessage;
      this.saveToStorage();
    }
  }

  getPendingItems(): SyncQueueItem[] {
    return this.queue.filter((q) => q.status === 'pending' || q.status === 'failed');
  }

  getQueue(): SyncQueueItem[] {
    return [...this.queue];
  }

  clearQueue() {
    this.queue = [];
    this.saveToStorage();
  }

  private handleNetworkRestore() {
    console.log('[SyncQueue] Network restored. Ready to flush queue.');
    this.notifyListeners();
  }
}

export const syncQueue = new SyncQueueManager();

export function generateOperationId(prefix: string = 'op'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}
