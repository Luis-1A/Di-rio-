import React, { useState } from 'react';
import { DiaryRecord } from '../types';
import { useResolvedMedia } from '../lib/mediaResolver';
import { CleanVideoPlayer } from './CleanVideoPlayer';
import {
  Image as ImageIcon,
  Video,
  Play,
  Pause,
  AlertCircle,
  RotateCw,
  Eye,
  FileText,
  Sparkles,
  Maximize2,
  Wand2,
  DownloadCloud,
  CheckCircle2,
  Radio,
  ExternalLink,
} from 'lucide-react';

interface MediaFeedRendererProps {
  record: DiaryRecord;
  onSelect?: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
  onEditPhoto?: (record: DiaryRecord, photoUrl: string) => void;
  mode?: 'feed' | 'detail';
}

export const MediaFeedRenderer: React.FC<MediaFeedRendererProps> = ({
  record,
  onSelect,
  onOpenPdf,
  onEditPhoto,
  mode = 'feed',
}) => {
  const {
    status,
    mediaUrl,
    mimeType,
    fileName,
    fileSize,
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
  } = useResolvedMedia(record);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioInstanceRef = React.useRef<HTMLAudioElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 1. IMAGE PREVIEW (Zero Crop, object-contain, instant render, clear states)
  if (isImage) {
    return (
      <div className="w-full space-y-2">
        <div
          className={`rounded-2xl overflow-hidden border border-stone-200/80 bg-stone-900/5 relative flex items-center justify-center transition-all ${
            mode === 'detail' ? 'min-h-[220px] max-h-[75vh] p-2' : 'min-h-[160px] max-h-80 p-1'
          }`}
        >
          {status === 'LOADING_METADATA' && !mediaUrl && (
            <div className="flex flex-col items-center justify-center p-8 text-stone-400 gap-2">
              <RotateCw className="w-5 h-5 animate-spin text-orange-500" />
              <span className="text-xs font-medium text-stone-500">Carregando foto...</span>
            </div>
          )}

          {status === 'ERROR' && !mediaUrl && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <p className="text-xs text-stone-600 font-medium">
                {errorMessage || 'Não foi possível carregar esta foto.'}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  retry();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-full cursor-pointer transition-colors"
              >
                <RotateCw className="w-3 h-3" />
                <span>Tentar novamente</span>
              </button>
            </div>
          )}

          {mediaUrl && (
            <div className="relative w-full flex items-center justify-center group/img">
              <img
                src={mediaUrl}
                alt={record.title || 'Foto'}
                onLoad={() => setImageLoaded(true)}
                className={`max-w-full w-auto h-auto object-contain rounded-xl transition-all duration-300 ${
                  mode === 'detail' ? 'max-h-[72vh]' : 'max-h-76'
                } ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                referrerPolicy="no-referrer"
                loading="lazy"
              />

              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RotateCw className="w-5 h-5 animate-spin text-orange-400" />
                </div>
              )}

              {/* Edit Photo Quick Action Pill (When hover or detail mode) */}
              {onEditPhoto && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditPhoto(record, mediaUrl);
                  }}
                  className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900/85 hover:bg-stone-900 text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-all shadow-md active:scale-95 cursor-pointer z-10"
                  title="Editar foto no sistema"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Editar foto</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. VIDEO PLAYER (Rebuilt from scratch with smooth progress bar & rock-solid playback)
  if (isVideo) {
    return (
      <div className="w-full">
        <CleanVideoPlayer record={record} mode={mode} />
      </div>
    );
  }

  // 3. AUDIO PLAYER (Custom Waveform & Timing)
  if (isAudio && mediaUrl) {
    const togglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!audioInstanceRef.current) {
        audioInstanceRef.current = new Audio(mediaUrl);
        audioInstanceRef.current.onended = () => setIsPlayingAudio(false);
      }

      if (isPlayingAudio) {
        audioInstanceRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        audioInstanceRef.current.play().then(() => {
          setIsPlayingAudio(true);
        }).catch(() => {});
      }
    };

    return (
      <div
        onClick={togglePlay}
        className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 flex items-center gap-3 hover:bg-emerald-100/60 transition-colors cursor-pointer"
      >
        <button
          type="button"
          className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs transition-transform active:scale-95 cursor-pointer"
        >
          {isPlayingAudio ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Dynamic Waveform Bars */}
        <div className="flex-1 flex items-center gap-0.5 h-6">
          {[
            35, 65, 45, 85, 55, 95, 75, 45, 65, 100, 80, 50, 90, 95, 65, 45, 55, 85,
            70, 40, 80, 95, 60, 35, 50, 65, 75, 45,
          ].map((h, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-150 ${
                isPlayingAudio && i % 3 === 0
                  ? 'bg-emerald-600 animate-pulse'
                  : 'bg-emerald-300'
              }`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <span className="text-[11px] font-mono text-emerald-800 font-semibold shrink-0">
          Áudio
        </span>
      </div>
    );
  }

  // 4. PDF / DOCUMENT CARD
  if (isPdf && mediaUrl && onOpenPdf) {
    return (
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-stone-900 truncate">
              {fileName || record.title || 'Documento PDF'}
            </p>
            <p className="text-[11px] text-stone-500">
              {fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'Visualização rápida'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPdf(mediaUrl, record.title || fileName, fileName, fileSize);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Abrir PDF</span>
        </button>
      </div>
    );
  }

  return null;
};
