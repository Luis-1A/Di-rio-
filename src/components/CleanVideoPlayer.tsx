import React, { useState, useEffect, useRef } from 'react';
import { DiaryRecord } from '../types';
import { getLocalMediaBlob, saveLocalMediaBlob } from '../lib/idbStorage';
import { storage } from '../lib/firebase';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { RotateCw, AlertCircle, Video, Play } from 'lucide-react';

interface CleanVideoPlayerProps {
  record: DiaryRecord;
  mode?: 'feed' | 'detail';
  className?: string;
  autoPlay?: boolean;
}

export const CleanVideoPlayer: React.FC<CleanVideoPlayerProps> = ({
  record,
  mode = 'feed',
  className = '',
  autoPlay = false,
}) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingPercent, setLoadingPercent] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Clean up object URLs and abort pending requests on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeXhrRef.current) {
        activeXhrRef.current.abort();
      }
      if (objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const loadVideo = async () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }

    setIsLoading(true);
    setLoadingPercent(0);
    setLoadError(null);

    const recordId = record.id;
    const fileId = record.fileId || (record.attachments && record.attachments[0]?.fileId) || recordId;
    const fileName = record.fileName || (record.attachments && record.attachments[0]?.name) || `video_${recordId}.mp4`;
    const mimeType = record.mimeType || (record.attachments && record.attachments[0]?.mimeType) || 'video/mp4';

    // 1. FAST-PATH: If already cached in device storage, animate bar smoothly and play instantly
    try {
      const localItem = (await getLocalMediaBlob(recordId)) || (await getLocalMediaBlob(fileId));
      if (localItem && localItem.blob && localItem.blob.size > 0) {
        if (!isMountedRef.current) return;

        // Smooth visual completion of the bar
        setLoadingPercent(65);
        await new Promise((r) => setTimeout(r, 120));
        if (!isMountedRef.current) return;

        setLoadingPercent(100);
        const objUrl = URL.createObjectURL(localItem.blob);
        objectUrlRef.current = objUrl;
        setVideoSrc(objUrl);

        setTimeout(() => {
          if (isMountedRef.current) {
            setIsLoading(false);
          }
        }, 180);
        return;
      }
    } catch (err) {
      console.warn('[VIDEO PLAYER] IndexedDB read warning:', err);
    }

    // 2. Resolve source URL
    let resolvedUrl: string | null = null;
    const storagePath = record.storagePath || (record.attachments && record.attachments[0]?.storagePath);

    if (storagePath) {
      try {
        const sRef = storageRef(storage, storagePath);
        resolvedUrl = await getDownloadURL(sRef);
      } catch (storageErr) {
        console.warn('[VIDEO PLAYER] Storage URL resolve warning:', storageErr);
      }
    }

    if (!resolvedUrl) {
      const directUrl =
        record.downloadUrl ||
        record.streamUrl ||
        (record.attachments && record.attachments[0]?.url) ||
        (record.attachments && record.attachments[0]?.streamUrl);

      if (directUrl && !directUrl.startsWith('blob:')) {
        resolvedUrl = directUrl;
      } else {
        resolvedUrl = `/api/media/stream/${fileId}`;
      }
    }

    if (!isMountedRef.current) return;

    if (!resolvedUrl) {
      setIsLoading(false);
      setLoadError('Não foi possível localizar o vídeo.');
      return;
    }

    // If inline data URI or existing blob URL, open immediately
    if (resolvedUrl.startsWith('data:') || resolvedUrl.startsWith('blob:')) {
      setLoadingPercent(100);
      setVideoSrc(resolvedUrl);
      setIsLoading(false);
      return;
    }

    // 3. Download the video with real percentage tracking
    // If resolvedUrl is an external HTTPS URL (e.g. Firebase Storage), proxy through server to guarantee CORS
    const isExternalHttps = resolvedUrl.startsWith('https://');
    const primaryFetchUrl = isExternalHttps
      ? `/api/media/proxy?url=${encodeURIComponent(resolvedUrl)}`
      : resolvedUrl;

    const startDownloadWithUrl = (targetUrl: string, fallbackUrl?: string) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open('GET', targetUrl, true);
      xhr.responseType = 'blob';

      xhr.onprogress = (event) => {
        if (!isMountedRef.current) return;
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setLoadingPercent(pct);
        } else {
          // Gradual increment if server didn't provide Content-Length
          setLoadingPercent((prev) => Math.min(96, Math.max(12, prev + 6)));
        }
      };

      xhr.onload = () => {
        if (!isMountedRef.current) return;
        activeXhrRef.current = null;

        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          const blob = xhr.response as Blob;
          if (blob && blob.size > 0) {
            setLoadingPercent(100);
            // Save to IndexedDB so next time it loads in 0 milliseconds
            saveLocalMediaBlob(recordId, blob, fileName, mimeType).catch(() => {});

            const objUrl = URL.createObjectURL(blob);
            objectUrlRef.current = objUrl;
            setVideoSrc(objUrl);

            setTimeout(() => {
              if (isMountedRef.current) {
                setIsLoading(false);
              }
            }, 200);
            return;
          }
        }

        // If status was not 200 and we have a fallback URL, try the fallback
        if (fallbackUrl) {
          console.warn('[VIDEO PLAYER] Tentando fallback para:', fallbackUrl);
          startDownloadWithUrl(fallbackUrl);
          return;
        }

        // Direct streaming fallback to HTML5 video tag
        setLoadingPercent(100);
        setVideoSrc(resolvedUrl!);
        setIsLoading(false);
      };

      xhr.onerror = () => {
        if (!isMountedRef.current) return;
        activeXhrRef.current = null;

        // If proxy or direct failed, try fallback
        if (fallbackUrl) {
          startDownloadWithUrl(fallbackUrl);
          return;
        }

        // If all downloads fail, liberate direct HTML5 video stream
        setLoadingPercent(100);
        setVideoSrc(resolvedUrl!);
        setIsLoading(false);
      };

      xhr.ontimeout = () => {
        if (!isMountedRef.current) return;
        activeXhrRef.current = null;
        setLoadingPercent(100);
        setVideoSrc(resolvedUrl!);
        setIsLoading(false);
      };

      xhr.timeout = 180000; // 3 minutes timeout for large files
      xhr.send();
    };

    // If using proxy, set direct resolvedUrl as fallback; otherwise no fallback
    const fallback = isExternalHttps ? resolvedUrl : undefined;
    startDownloadWithUrl(primaryFetchUrl, fallback);
  };

  useEffect(() => {
    loadVideo();
    return () => {
      if (activeXhrRef.current) {
        activeXhrRef.current.abort();
      }
    };
  }, [record.id, record.downloadUrl, record.storagePath]);

  // Handle immediate play release if user chooses not to wait for 100% download
  const handleImmediateRelease = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    const directUrl =
      record.downloadUrl ||
      record.streamUrl ||
      (record.attachments && record.attachments[0]?.url) ||
      `/api/media/stream/${record.fileId || record.id}`;

    setLoadingPercent(100);
    setVideoSrc(directUrl);
    setIsLoading(false);
  };

  return (
    <div
      className={`w-full overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 flex flex-col items-center justify-center relative ${className}`}
    >
      {/* 1. REAL-TIME PROGRESS BAR WHILE DOWNLOADING VIDEO */}
      {isLoading && (
        <div className="w-full flex flex-col items-center justify-center p-8 sm:p-12 space-y-4 min-h-[220px]">
          <div className="w-12 h-12 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 shadow-inner">
            <Video className="w-6 h-6 animate-pulse text-amber-400" />
          </div>

          <div className="w-60 sm:w-72 max-w-[85%] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-stone-300 px-0.5">
              <span>Carregando vídeo</span>
              <span className="font-semibold text-amber-400 tabular-nums">{loadingPercent}%</span>
            </div>

            <div className="w-full h-2.5 bg-stone-800 rounded-full overflow-hidden p-0.5 border border-stone-700/60 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-150 ease-out shadow-xs"
                style={{ width: `${Math.max(4, loadingPercent)}%` }}
              />
            </div>
          </div>

          {/* Optional instant release button if user wants to play immediately */}
          <button
            type="button"
            onClick={handleImmediateRelease}
            className="text-[11px] text-stone-400 hover:text-stone-200 transition-colors inline-flex items-center gap-1 cursor-pointer pt-1"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Liberar reprodução agora</span>
          </button>
        </div>
      )}

      {/* 2. ERROR STATE WITH RETRY */}
      {!isLoading && loadError && (
        <div className="w-full flex flex-col items-center justify-center p-8 text-center space-y-3 min-h-[200px]">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <p className="text-xs text-stone-300 font-medium max-w-xs">{loadError}</p>
          <button
            type="button"
            onClick={() => loadVideo()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors cursor-pointer border border-stone-700 active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* 3. RELEASED VIDEO PLAYER (Play liberated, native controls, screen-responsive) */}
      {!isLoading && !loadError && videoSrc && (
        <div className="relative w-full flex items-center justify-center bg-black rounded-2xl overflow-hidden">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            playsInline
            autoPlay={autoPlay}
            preload="auto"
            className={`w-full h-auto max-w-full object-contain ${
              mode === 'detail' ? 'max-h-[75vh]' : 'max-h-72 sm:max-h-80'
            }`}
            onError={() => {
              setLoadError('Não foi possível reproduzir este formato de vídeo.');
            }}
          >
            Seu navegador não suporta reprodução de vídeo HTML5.
          </video>
        </div>
      )}
    </div>
  );
};
