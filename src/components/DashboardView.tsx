import React, { useState } from 'react';
import { DiaryRecord, MemoryItem, UserProfile } from '../types';
import {
  Sparkles,
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
  ExternalLink,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  onNewRecord: () => void;
  onOpenChat: () => void;
  onSelectRecord: (record: DiaryRecord) => void;
  onViewAllRecords: () => void;
  onViewAllMemories: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  records,
  onNewRecord,
  onOpenChat,
  onSelectRecord,
  onViewAllRecords,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const recentRecords = activeRecords.slice(0, 10);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const getRecordBadge = (type: string) => {
    switch (type) {
      case 'photo':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            <ImageIcon className="w-3 h-3 text-amber-600" />
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
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
            <Video className="w-3 h-3 text-rose-600" />
            <span>Vídeo</span>
          </span>
        );
      case 'document':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
            <File className="w-3 h-3 text-blue-600" />
            <span>Arquivo</span>
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

      return created.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'short',
      }) + `, ${timeStr}`;
    } catch {
      return dateStr || '';
    }
  };

  const toggleAudio = (e: React.MouseEvent, recordId: string, audioUrl?: string) => {
    e.stopPropagation();
    if (!audioUrl) return;
    if (playingAudioId === recordId) {
      setPlayingAudioId(null);
    } else {
      setPlayingAudioId(recordId);
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingAudioId(null);
    }
  };

  return (
    <div id="dashboard-feed" className="max-w-md md:max-w-lg mx-auto px-4 py-4 space-y-5">
      {/* 1. IA Central Card (Top) */}
      <div className="bg-white border border-stone-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] relative overflow-hidden">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 mt-0.5">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-800">IA Central</h2>
            <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
              Converse comigo ou encontre algo no seu arquivo.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={onOpenChat}
            className="w-auto px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white text-xs font-semibold rounded-full shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Conversar com a IA</span>
          </button>
        </div>
      </div>

      {/* 2. Seus Registros Header */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-sm font-semibold text-stone-800 tracking-tight">
          Seus registros
        </h3>

        <button
          onClick={onNewRecord}
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 bg-orange-50/80 hover:bg-orange-100/70 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
          <span>Novo registro</span>
        </button>
      </div>

      {/* 3. Feed List */}
      {recentRecords.length === 0 ? (
        <div className="bg-white border border-stone-100 rounded-3xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-stone-800">Nenhum registro ainda</h4>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Guarde textos, fotos, áudios, vídeos e arquivos com total facilidade.
            </p>
          </div>
          <button
            onClick={onNewRecord}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar primeiro registro</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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
              (a) => a.type === 'document' || (!photoAttachment && !videoAttachment && !audioAttachment && a.url)
            );

            return (
              <div
                key={record.id}
                onClick={() => onSelectRecord(record)}
                className="bg-white hover:bg-stone-50/50 border border-stone-100/90 rounded-3xl p-4 transition-all duration-150 cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.02)] group space-y-2.5"
              >
                {/* Top Badge & Date/Time */}
                <div className="flex items-center justify-between gap-2">
                  {getRecordBadge(record.type)}
                  <span className="text-[11px] text-stone-400 font-normal">
                    {formatFeedTime(record.date, record.createdAt)}
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-stone-800 leading-snug group-hover:text-orange-700 transition-colors">
                  {record.title || (record.type === 'text' ? 'Anotação' : 'Registro')}
                </h4>

                {/* Text Content */}
                {record.content && (
                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                    {record.content}
                  </p>
                )}

                {/* Photo Preview (Banner) */}
                {photoAttachment && (
                  <div className="rounded-2xl overflow-hidden border border-stone-100 bg-stone-100 aspect-video max-h-48 relative">
                    <img
                      src={photoAttachment.url}
                      alt={record.title || 'Foto'}
                      className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Video Preview (Banner with Play overlay) */}
                {videoAttachment && (
                  <div className="rounded-2xl overflow-hidden border border-stone-100 bg-stone-900 aspect-video max-h-48 relative group/vid">
                    <video
                      src={videoAttachment.url}
                      className="w-full h-full object-cover opacity-80"
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white shadow-md group-hover/vid:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono px-1.5 py-0.5 rounded-md">
                      00:42
                    </div>
                  </div>
                )}

                {/* Audio Waveform Player */}
                {audioAttachment && (
                  <div
                    onClick={(e) => toggleAudio(e, record.id, audioAttachment.url)}
                    className="bg-stone-50/80 border border-stone-200/60 rounded-2xl p-2.5 flex items-center gap-3 hover:bg-orange-50/40 transition-colors"
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
                        30, 60, 45, 80, 50, 90, 70, 40, 60, 100, 75, 45, 85, 95, 60, 40,
                        50, 80, 65, 35, 75, 90, 55, 30, 45, 60, 70, 40,
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
                      01:24
                    </span>
                  </div>
                )}

                {/* Document File Row */}
                {docAttachment && (
                  <div className="bg-stone-50/80 border border-stone-200/60 rounded-2xl p-2.5 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                      <File className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate">
                        {docAttachment.name || 'Arquivo em anexo'}
                      </p>
                      <p className="text-[10px] text-stone-400">
                        {docAttachment.name?.toUpperCase().endsWith('.PDF') ? 'PDF' : 'Documento'} •{' '}
                        {docAttachment.size
                          ? `${(docAttachment.size / (1024 * 1024)).toFixed(1)} MB`
                          : 'Arquivo salvo'}
                      </p>
                    </div>
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
