import React, { useState } from 'react';
import { DiaryRecord } from '../types';
import { useResolvedMedia } from '../lib/mediaResolver';
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
  const [videoError, setVideoError] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);

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

  // 2. VIDEO PLAYER (Zero Crop, progressive live streaming, offline caching & fallback)
  if (isVideo) {
    return (
      <div className="w-full space-y-2">
        <div
          className={`rounded-2xl overflow-hidden border border-stone-800 bg-stone-950 relative flex items-center justify-center transition-all ${
            mode === 'detail' ? 'min-h-[240px] max-h-[72vh]' : 'aspect-video max-h-60'
          }`}
        >
          {status === 'LOADING_METADATA' && !mediaUrl && (
            <div className="flex flex-col items-center justify-center p-8 text-white gap-2.5">
              <RotateCw className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs font-medium text-stone-300">Conectando transmissão do vídeo...</span>
            </div>
          )}

          {(status === 'ERROR' || videoError) && !mediaUrl && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-white">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <p className="text-xs text-stone-300 font-medium">
                {errorMessage || 'Não foi possível reproduzir este vídeo diretamente.'}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVideoError(false);
                    retry();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-purple-300 bg-purple-900/60 hover:bg-purple-900 px-3 py-1.5 rounded-full cursor-pointer transition-colors border border-purple-500/40"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Tentar novamente</span>
                </button>
                {mediaUrl && (
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-stone-300 bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded-full cursor-pointer transition-colors border border-stone-700"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Abrir link</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {mediaUrl && (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                src={mediaUrl}
                controls
                playsInline
                preload="auto"
                className={`w-full h-auto max-w-full object-contain ${
                  mode === 'detail' ? 'max-h-[70vh]' : 'max-h-60'
                }`}
                onClick={(e) => e.stopPropagation()}
                onWaiting={() => setVideoBuffering(true)}
                onPlaying={() => setVideoBuffering(false)}
                onCanPlay={() => setVideoBuffering(false)}
                onError={() => {
                  setVideoBuffering(false);
                  setVideoError(true);
                }}
              >
                Seu navegador não suporta reprodução de vídeo HTML5.
              </video>

              {videoBuffering && (
                <div className="absolute top-3 left-3 bg-stone-900/85 backdrop-blur-xs text-purple-300 text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 pointer-events-none shadow-sm z-10 border border-purple-500/30">
                  <RotateCw className="w-3 h-3 animate-spin text-purple-400" />
                  <span>Carregando transmissão...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video Stream / Cache Status Bar */}
        {mediaUrl && (
          <div className="flex items-center justify-between text-xs px-1 text-stone-500">
            <div className="flex items-center gap-1.5">
              {isFromCache ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium text-[11px]">
                  <CheckCircle2 className="w-3 h-3" />
                  Salvo no cache deste celular
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-medium text-[11px]">
                  <Radio className="w-3 h-3 animate-pulse text-purple-600" />
                  Transmitindo da nuvem (Internet / Live)
                </span>
              )}
            </div>

            {/* Cache Button if viewing from internet */}
            {!isFromCache && (
              <button
                type="button"
                disabled={isDownloadingToCache}
                onClick={(e) => {
                  e.stopPropagation();
                  cacheLocally();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                title="Salvar vídeo no cache local para assistir offline"
              >
                {isDownloadingToCache ? (
                  <>
                    <RotateCw className="w-3 h-3 animate-spin text-purple-600" />
                    <span>Baixando ({downloadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-3 h-3 text-stone-600" />
                    <span>Baixar pro cache</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
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
