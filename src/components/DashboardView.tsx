import React, { useState } from 'react';
import { DiaryRecord, MemoryItem, UserProfile } from '../types';
import { getLocalMediaBlob } from '../lib/idbStorage';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  File,
  Play,
  Pause,
  ArrowRight,
  Clock,
  Eye,
  FolderClosed,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  onNewRecord: (type?: 'text' | 'photo' | 'audio' | 'video' | 'document') => void;
  onSelectRecord: (record: DiaryRecord) => void;
  onViewAllRecords: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  records,
  onNewRecord,
  onSelectRecord,
  onViewAllRecords,
  onOpenPdf,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const recentRecords = activeRecords.slice(0, 10);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioInstancesRef = React.useRef<Record<string, HTMLAudioElement>>({});

  const stats = {
    total: activeRecords.length,
    photos: activeRecords.filter((r) => r.type === 'photo').length,
    audios: activeRecords.filter((r) => r.type === 'audio').length,
    videos: activeRecords.filter((r) => r.type === 'video').length,
    docs: activeRecords.filter((r) => r.type === 'document').length,
    texts: activeRecords.filter((r) => r.type === 'text').length,
  };

  const getRecordBadge = (type: string) => {
    switch (type) {
      case 'photo':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
            <ImageIcon className="w-3 h-3 text-sky-600" />
            <span>Foto</span>
          </span>
        );
      case 'audio':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
            <Mic className="w-3 h-3 text-emerald-600" />
            <span>Áudio</span>
          </span>
        );
      case 'video':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60">
            <Video className="w-3 h-3 text-purple-600" />
            <span>Vídeo</span>
          </span>
        );
      case 'document':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            <File className="w-3 h-3 text-amber-600" />
            <span>PDF / Arquivo</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200/60">
            <FileText className="w-3 h-3 text-stone-500" />
            <span>Texto</span>
          </span>
        );
    }
  };

  const getSyncBadge = (status?: string) => {
    if (status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
          <Clock className="w-2.5 h-2.5 text-amber-600 animate-spin" />
          <span>Sincronizando</span>
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60">
          <span>Pendente</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50/70 px-1.5 py-0.5 rounded border border-emerald-200/50">
        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
        <span>Nuvem</span>
      </span>
    );
  };

  const formatFeedTime = (dateStr: string, createdAt: string) => {
    try {
      const now = new Date();
      const created = new Date(createdAt || dateStr);

      const isToday =
        now.getFullYear() === created.getFullYear() &&
        now.getMonth() === created.getMonth() &&
        now.getDate() === created.getDate();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        yesterday.getFullYear() === created.getFullYear() &&
        yesterday.getMonth() === created.getMonth() &&
        yesterday.getDate() === created.getDate();

      const timeStr = created.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isToday) return `Hoje, ${timeStr}`;
      if (isYesterday) return `Ontem, ${timeStr}`;

      return (
        created.toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'short',
        }) + `, ${timeStr}`
      );
    } catch {
      return dateStr || '';
    }
  };

  const toggleAudio = async (e: React.MouseEvent, recordId: string, audioUrl?: string) => {
    e.stopPropagation();

    let resolvedUrl = audioUrl;
    if (!resolvedUrl) {
      const stored = await getLocalMediaBlob(recordId);
      if (stored && stored.blob) {
        resolvedUrl = URL.createObjectURL(stored.blob);
      }
    }

    if (!resolvedUrl) return;

    if (playingAudioId === recordId) {
      if (audioInstancesRef.current[recordId]) {
        audioInstancesRef.current[recordId].pause();
      }
      setPlayingAudioId(null);
    } else {
      // Pause any existing
      Object.values(audioInstancesRef.current).forEach((a) => {
        if (a instanceof HTMLAudioElement) a.pause();
      });

      if (!audioInstancesRef.current[recordId]) {
        audioInstancesRef.current[recordId] = new Audio(resolvedUrl);
        audioInstancesRef.current[recordId].onended = () => setPlayingAudioId(null);
      }

      audioInstancesRef.current[recordId].play().catch(() => {});
      setPlayingAudioId(recordId);
    }
  };

  return (
    <div id="dashboard-feed" className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-5">
      {/* 1. Quick Creation Hub & System Status */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-800">
              Diário & Arquivo Pessoal
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Armazenamento seguro sincronizado em todos os dispositivos
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-medium border border-emerald-200/80">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Nuvem Ativa</span>
          </div>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="grid grid-cols-5 gap-2 pt-1">
          <button
            onClick={() => onNewRecord('text')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-orange-50 border border-stone-200/70 hover:border-orange-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-orange-600 shadow-xs mb-1">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-orange-700">
              Texto
            </span>
          </button>

          <button
            onClick={() => onNewRecord('photo')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-sky-50 border border-stone-200/70 hover:border-sky-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-sky-600 shadow-xs mb-1">
              <ImageIcon className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-sky-700">
              Foto
            </span>
          </button>

          <button
            onClick={() => onNewRecord('audio')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-emerald-50 border border-stone-200/70 hover:border-emerald-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-emerald-600 shadow-xs mb-1">
              <Mic className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-emerald-700">
              Áudio
            </span>
          </button>

          <button
            onClick={() => onNewRecord('video')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-purple-50 border border-stone-200/70 hover:border-purple-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-purple-600 shadow-xs mb-1">
              <Video className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-purple-700">
              Vídeo
            </span>
          </button>

          <button
            onClick={() => onNewRecord('document')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-amber-50 border border-stone-200/70 hover:border-amber-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-amber-600 shadow-xs mb-1">
              <File className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-amber-700">
              PDF
            </span>
          </button>
        </div>
      </div>

      {/* 2. Registros Recentes Header */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-sm font-bold text-stone-800 tracking-tight">
          Registros recentes ({stats.total})
        </h3>

        <button
          onClick={() => onNewRecord()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50/80 hover:bg-orange-100/80 px-3 py-1 rounded-full transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Novo registro</span>
        </button>
      </div>

      {/* 3. Feed List */}
      {recentRecords.length === 0 ? (
        <div className="bg-white border border-stone-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <FolderClosed className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-stone-800">
              Seu diário está pronto para uso
            </h4>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Guarde textos, fotos, gravações de áudio, vídeos e documentos PDF com confirmação garantida na nuvem.
            </p>
          </div>
          <button
            onClick={() => onNewRecord()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Criar primeiro registro</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {recentRecords.map((record) => {
            const photoAttachment = record.attachments?.find(
              (a) => a.type === 'image' || a.mimeType?.startsWith('image/')
            );
            const videoAttachment = record.attachments?.find(
              (a) => a.type === 'video' || a.mimeType?.startsWith('video/')
            );
            const audioAttachment = record.attachments?.find(
              (a) => a.type === 'audio' || a.mimeType?.startsWith('audio/')
            );
            const docAttachment = record.attachments?.find(
              (a) =>
                a.type === 'document' ||
                (!photoAttachment && !videoAttachment && !audioAttachment && a.url)
            );
            const isPDF =
              docAttachment?.name?.toLowerCase().endsWith('.pdf') ||
              docAttachment?.mimeType === 'application/pdf';

            return (
              <div
                key={record.id}
                onClick={() => onSelectRecord(record)}
                className="bg-white hover:bg-stone-50/60 border border-stone-200/80 rounded-3xl p-4 transition-all duration-150 cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.02)] group space-y-3"
              >
                {/* Top Badge & Date/Time & Sync Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {getRecordBadge(record.type)}
                    {getSyncBadge(record.syncStatus)}
                  </div>
                  <span className="text-[11px] text-stone-400 font-normal">
                    {formatFeedTime(record.date, record.createdAt)}
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-stone-800 leading-snug group-hover:text-orange-700 transition-colors">
                  {record.title ||
                    (record.type === 'text' ? 'Anotação' : 'Registro')}
                </h4>

                {/* Text Content */}
                {record.content && (
                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                    {record.content}
                  </p>
                )}

                {/* Photo Preview */}
                {(photoAttachment?.url || (record.type === 'photo' && record.downloadUrl)) && (
                  <div className="rounded-2xl overflow-hidden border border-stone-200/80 bg-stone-100 aspect-video max-h-56 relative">
                    <img
                      src={photoAttachment?.url || record.downloadUrl}
                      alt={record.title || 'Foto'}
                      className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Video Preview */}
                {(videoAttachment?.url || (record.type === 'video' && record.downloadUrl)) && (
                  <div className="rounded-2xl overflow-hidden border border-stone-200/80 bg-stone-900 aspect-video max-h-56 relative group/vid">
                    <video
                      src={videoAttachment?.url || record.downloadUrl}
                      className="w-full h-full object-contain"
                      controls
                      preload="metadata"
                    />
                  </div>
                )}

                {/* Audio Waveform Player */}
                {audioAttachment && (
                  <div
                    onClick={(e) =>
                      toggleAudio(e, record.id, audioAttachment.url)
                    }
                    className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 flex items-center gap-3 hover:bg-orange-50/40 transition-colors"
                  >
                    <button
                      type="button"
                      className="w-8 h-8 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                    >
                      {playingAudioId === record.id ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Waveform graphic bars */}
                    <div className="flex-1 flex items-center gap-0.5 h-6">
                      {[
                        30, 60, 45, 80, 50, 90, 70, 40, 60, 100, 75, 45, 85, 95,
                        60, 40, 50, 80, 65, 35, 75, 90, 55, 30, 45, 60, 70, 40,
                      ].map((h, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all ${
                            playingAudioId === record.id && i % 3 === 0
                              ? 'bg-orange-600 animate-pulse'
                              : 'bg-stone-300'
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-stone-500 shrink-0">
                      {record.attachments?.[0]?.durationSeconds
                        ? `00:${record.attachments[0].durationSeconds.toString().padStart(2, '0')}`
                        : 'Áudio'}
                    </span>
                  </div>
                )}

                {/* PDF & Document Row */}
                {docAttachment && (
                  <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                        <File className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-stone-800 truncate">
                          {docAttachment.name || 'Documento em anexo'}
                        </p>
                        <p className="text-[10px] text-stone-400">
                          {isPDF ? 'Documento PDF' : 'Arquivo'} •{' '}
                          {docAttachment.size
                            ? `${(docAttachment.size / (1024 * 1024)).toFixed(2)} MB`
                            : 'Arquivo salvo'}
                        </p>
                      </div>
                    </div>

                    {isPDF && onOpenPdf && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPdf(
                            docAttachment.url,
                            record.title || docAttachment.name || 'Documento PDF',
                            docAttachment.name,
                            docAttachment.size
                          );
                        }}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Abrir PDF</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {activeRecords.length > 10 && (
            <div className="pt-2 text-center">
              <button
                onClick={onViewAllRecords}
                className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-semibold px-4 py-2 rounded-full hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <span>Ver todos os {activeRecords.length} registros no Arquivo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
