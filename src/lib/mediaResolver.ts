/**
 * Smart Media Resolver & Intelligent Multi-Tier Cache for Diário Pessoal
 *
 * Architecture:
 * 1. Firebase Firestore is the official source of truth for records.
 * 2. Firebase Storage is the official source of truth for binary files.
 * 3. Local IndexedDB Cache (`media_blobs`) is an accelerator (download once, view instantly forever).
 * 4. Never blocks rendering on cache misses: streams directly from Storage/Server URLs immediately.
 * 5. Provides explicit, robust loading lifecycles with timeouts and user retries (never stuck in "Sincronizando nuvem...").
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { DiaryRecord, RecordAttachment } from '../types';
import { getLocalMediaBlob, saveLocalMediaBlob } from './idbStorage';

export type MediaLoadStatus = 'IDLE' | 'LOADING_METADATA' | 'LOADING_MEDIA' | 'READY' | 'ERROR';

export interface ResolvedMediaState {
  status: MediaLoadStatus;
  mediaUrl: string | null;
  mimeType: string;
  fileName: string;
  fileSize: number;
  isFromCache: boolean;
  isVideo: boolean;
  isImage: boolean;
  isAudio: boolean;
  isPdf: boolean;
  isDocument: boolean;
  errorMessage: string | null;
  retry: () => void;
}

// In-Memory Fast Cache for Object URLs and Storage URLs
const inMemoryUrlCache = new Map<string, string>();

/**
 * Extracts the best initial URL, storage path, and MIME type from a DiaryRecord.
 */
export function extractMediaMetadata(record: DiaryRecord): {
  primaryUrl: string;
  storagePath?: string;
  thumbnailUrl?: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  attachmentId?: string;
} {
  const att = record.attachments && record.attachments.length > 0 ? record.attachments[0] : null;

  const rawUrl = att?.url || record.downloadUrl || '';
  const storagePath = att?.storagePath || record.storagePath;
  const thumbnailUrl = att?.thumbnailUrl || record.thumbnailUrl;
  const fileName = att?.name || record.fileName || `arquivo_${record.id}`;
  const fileSize = att?.size || record.fileSize || 0;

  let mimeType = att?.mimeType || record.mimeType || '';

  if (!mimeType) {
    if (record.type === 'photo') mimeType = 'image/jpeg';
    else if (record.type === 'video') mimeType = 'video/mp4';
    else if (record.type === 'audio') mimeType = 'audio/webm';
    else if (record.type === 'document' && (fileName.endsWith('.pdf') || rawUrl.includes('.pdf'))) {
      mimeType = 'application/pdf';
    } else {
      mimeType = 'application/octet-stream';
    }
  }

  return {
    primaryUrl: rawUrl,
    storagePath,
    thumbnailUrl,
    mimeType,
    fileName,
    fileSize,
    attachmentId: att?.id,
  };
}

/**
 * Resolves a media file from:
 * 1. In-memory URL cache
 * 2. Local IndexedDB Cache
 * 3. Direct HTTP/Storage URL (with progressive streaming)
 * 4. Firebase Storage SDK getDownloadURL
 *
 * And stores a copy in IndexedDB in the background for instant future loads.
 */
export async function resolveMediaSource(
  record: DiaryRecord,
  options?: { timeoutMs?: number; saveToCacheInBackground?: boolean }
): Promise<{ url: string; mimeType: string; isFromCache: boolean }> {
  const { timeoutMs = 15000, saveToCacheInBackground = true } = options || {};
  const meta = extractMediaMetadata(record);

  // 1. Check in-memory URL cache
  const memoryCached = inMemoryUrlCache.get(record.id);
  if (memoryCached) {
    return { url: memoryCached, mimeType: meta.mimeType, isFromCache: true };
  }

  // 2. Check Local IndexedDB
  try {
    const localItem = await getLocalMediaBlob(record.id);
    if (localItem && localItem.blob && localItem.blob.size > 0) {
      const objUrl = URL.createObjectURL(localItem.blob);
      inMemoryUrlCache.set(record.id, objUrl);
      return { url: objUrl, mimeType: localItem.mimeType || meta.mimeType, isFromCache: true };
    }
  } catch (err) {
    console.warn('[MEDIA RESOLVER] IndexedDB read warning:', err);
  }

  // 3. Direct URL available (Firebase Storage public URL, server file URL, or data URL)
  if (meta.primaryUrl && (meta.primaryUrl.startsWith('http') || meta.primaryUrl.startsWith('/api/') || meta.primaryUrl.startsWith('data:'))) {
    inMemoryUrlCache.set(record.id, meta.primaryUrl);

    // Save to local cache in the background if it's a remote URL and not a huge video
    if (
      saveToCacheInBackground &&
      meta.primaryUrl.startsWith('http') &&
      record.type !== 'video' &&
      typeof fetch !== 'undefined'
    ) {
      fetch(meta.primaryUrl)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob) {
            saveLocalMediaBlob(record.id, blob, meta.fileName, meta.mimeType).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return { url: meta.primaryUrl, mimeType: meta.mimeType, isFromCache: false };
  }

  // 4. Resolve via Firebase Storage storagePath with strict timeout
  if (meta.storagePath) {
    try {
      const fetchPromise = (async () => {
        const sRef = storageRef(storage, meta.storagePath);
        const url = await getDownloadURL(sRef);
        return url;
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido ao buscar arquivo na nuvem.')), timeoutMs)
      );

      const downloadUrl = await Promise.race([fetchPromise, timeoutPromise]);
      inMemoryUrlCache.set(record.id, downloadUrl);

      // Background caching
      if (saveToCacheInBackground && record.type !== 'video' && typeof fetch !== 'undefined') {
        fetch(downloadUrl)
          .then((res) => (res.ok ? res.blob() : null))
          .then((blob) => {
            if (blob) {
              saveLocalMediaBlob(record.id, blob, meta.fileName, meta.mimeType).catch(() => {});
            }
          })
          .catch(() => {});
      }

      return { url: downloadUrl, mimeType: meta.mimeType, isFromCache: false };
    } catch (storageErr: any) {
      console.warn('[MEDIA RESOLVER] Firebase Storage resolve warning for', meta.storagePath, storageErr);
      throw storageErr;
    }
  }

  // 5. Fallback to thumbnail URL if present
  if (meta.thumbnailUrl) {
    return { url: meta.thumbnailUrl, mimeType: 'image/jpeg', isFromCache: false };
  }

  throw new Error('Nenhuma fonte de mídia encontrada para este registro.');
}

/**
 * Custom React Hook for robust, responsive media loading with timeout and instant cache
 */
export function useResolvedMedia(
  record: DiaryRecord,
  options?: { timeoutMs?: number; autoFetch?: boolean }
): ResolvedMediaState {
  const { timeoutMs = 15000, autoFetch = true } = options || {};
  const meta = extractMediaMetadata(record);

  const [status, setStatus] = useState<MediaLoadStatus>('LOADING_METADATA');
  const [mediaUrl, setMediaUrl] = useState<string | null>(() => {
    // Initial fast synchronous check
    if (inMemoryUrlCache.has(record.id)) {
      return inMemoryUrlCache.get(record.id) || null;
    }
    if (meta.primaryUrl && (meta.primaryUrl.startsWith('http') || meta.primaryUrl.startsWith('/api/'))) {
      return meta.primaryUrl;
    }
    return meta.thumbnailUrl || null;
  });
  const [isFromCache, setIsFromCache] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const [retryCounter, setRetryCounter] = useState(0);

  const isVideo = record.type === 'video' || meta.mimeType.startsWith('video/');
  const isImage = record.type === 'photo' || meta.mimeType.startsWith('image/');
  const isAudio = record.type === 'audio' || meta.mimeType.startsWith('audio/');
  const isPdf =
    record.type === 'document' &&
    (meta.mimeType === 'application/pdf' || meta.fileName.toLowerCase().endsWith('.pdf'));
  const isDocument = record.type === 'document' && !isPdf;

  const performResolve = useCallback(async () => {
    if (!autoFetch) return;

    setStatus('LOADING_METADATA');
    setErrorMessage(null);

    // If we already have a direct workable URL, set it immediately to start streaming
    if (meta.primaryUrl && (meta.primaryUrl.startsWith('http') || meta.primaryUrl.startsWith('/api/') || meta.primaryUrl.startsWith('data:'))) {
      setMediaUrl(meta.primaryUrl);
      setStatus('READY');
    }

    try {
      const res = await resolveMediaSource(record, { timeoutMs });
      if (!isMountedRef.current) return;

      setMediaUrl(res.url);
      setIsFromCache(res.isFromCache);
      setStatus('READY');
      setErrorMessage(null);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn(`[MEDIA HOOK ERROR] Falha ao resolver mídia para ${record.id}:`, err);

      // If we already have a direct or thumbnail URL, don't show full error
      if (meta.primaryUrl || meta.thumbnailUrl) {
        setMediaUrl(meta.primaryUrl || meta.thumbnailUrl || null);
        setStatus('READY');
      } else {
        setStatus('ERROR');
        setErrorMessage(
          err.message || 'Não foi possível carregar a mídia deste registro.'
        );
      }
    }
  }, [record.id, record.downloadUrl, record.storagePath, meta.primaryUrl, meta.storagePath, meta.thumbnailUrl, timeoutMs, autoFetch, retryCounter]);

  useEffect(() => {
    isMountedRef.current = true;
    performResolve();

    return () => {
      isMountedRef.current = false;
    };
  }, [performResolve]);

  const retry = useCallback(() => {
    setRetryCounter((c) => c + 1);
  }, []);

  return {
    status,
    mediaUrl,
    mimeType: meta.mimeType,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    isFromCache,
    isVideo,
    isImage,
    isAudio,
    isPdf,
    isDocument,
    errorMessage,
    retry,
  };
}
