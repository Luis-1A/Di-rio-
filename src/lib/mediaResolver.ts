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
  isDownloadingToCache: boolean;
  downloadProgress: number;
  cacheLocally: () => Promise<boolean>;
  retry: () => void;
}

// In-Memory Fast Cache for Object URLs and Storage URLs
const inMemoryUrlCache = new Map<string, string>();

/**
 * Downloads a remote media file directly into the local IndexedDB cache,
 * allowing instant offline playback on this device without consuming data.
 */
export async function cacheMediaToLocal(
  record: DiaryRecord,
  onProgress?: (percent: number) => void
): Promise<string | null> {
  const meta = extractMediaMetadata(record);
  let targetUrl = meta.primaryUrl;

  if (!targetUrl && meta.storagePath) {
    try {
      const sRef = storageRef(storage, meta.storagePath);
      targetUrl = await getDownloadURL(sRef);
    } catch (e) {
      console.warn('[CACHE MEDIA] Falha ao obter URL de download:', e);
      return null;
    }
  }

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return null;
  }

  try {
    onProgress?.(10);
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body?.getReader();
    const contentLength = Number(response.headers.get('Content-Length')) || meta.fileSize || 0;

    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    if (reader && contentLength > 0) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedLength += value.length;
          const pct = Math.min(95, Math.round((receivedLength / contentLength) * 100));
          onProgress?.(pct);
        }
      }
    }

    const blob = chunks.length > 0
      ? new Blob(chunks, { type: meta.mimeType || 'application/octet-stream' })
      : await response.blob();

    onProgress?.(98);
    await saveLocalMediaBlob(record.id, blob, meta.fileName, meta.mimeType);

    const objectUrl = URL.createObjectURL(blob);
    inMemoryUrlCache.set(record.id, objectUrl);
    onProgress?.(100);

    return objectUrl;
  } catch (err) {
    console.warn('[CACHE MEDIA] Erro ao salvar mídia no cache local:', err);
    return null;
  }
}

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
 * 3. Direct HTTP/Storage URL (Live progressive streaming over internet)
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

  // 2. Check Local IndexedDB (Instant local playback)
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

  // 3. Direct URL available (Firebase Storage public URL, live streaming or data URL)
  if (meta.primaryUrl && (meta.primaryUrl.startsWith('http') || meta.primaryUrl.startsWith('/api/') || meta.primaryUrl.startsWith('data:'))) {
    inMemoryUrlCache.set(record.id, meta.primaryUrl);

    // Save to local cache in the background for files up to 50MB
    if (
      saveToCacheInBackground &&
      meta.primaryUrl.startsWith('http') &&
      typeof fetch !== 'undefined' &&
      (!meta.fileSize || meta.fileSize < 50 * 1024 * 1024)
    ) {
      fetch(meta.primaryUrl)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob && blob.size > 0) {
            saveLocalMediaBlob(record.id, blob, meta.fileName, meta.mimeType).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return { url: meta.primaryUrl, mimeType: meta.mimeType, isFromCache: false };
  }

  // 4. Resolve via Firebase Storage storagePath with timeout
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
      if (
        saveToCacheInBackground &&
        typeof fetch !== 'undefined' &&
        (!meta.fileSize || meta.fileSize < 50 * 1024 * 1024)
      ) {
        fetch(downloadUrl)
          .then((res) => (res.ok ? res.blob() : null))
          .then((blob) => {
            if (blob && blob.size > 0) {
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
 * Custom React Hook for robust, responsive media loading with timeout, live internet stream & instant cache
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
  const [isDownloadingToCache, setIsDownloadingToCache] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
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

    // If we already have a direct workable URL, set it immediately to start streaming like Live
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

  const cacheLocally = useCallback(async (): Promise<boolean> => {
    if (isDownloadingToCache) return false;
    setIsDownloadingToCache(true);
    setDownloadProgress(0);

    try {
      const localUrl = await cacheMediaToLocal(record, (pct) => {
        if (isMountedRef.current) setDownloadProgress(pct);
      });

      if (localUrl && isMountedRef.current) {
        setMediaUrl(localUrl);
        setIsFromCache(true);
        setIsDownloadingToCache(false);
        return true;
      }
    } catch (e) {
      console.warn('[CACHE LOCALLY] Erro:', e);
    }

    if (isMountedRef.current) {
      setIsDownloadingToCache(false);
    }
    return false;
  }, [record, isDownloadingToCache]);

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
    isDownloadingToCache,
    downloadProgress,
    cacheLocally,
    retry,
  };
}
