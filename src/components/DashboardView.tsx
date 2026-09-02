import React, { useState } from 'react';
import { DiaryRecord, MemoryItem, UserProfile } from '../types';
import { MediaFeedRenderer } from './MediaFeedRenderer';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  File,
  ArrowRight,
  Clock,
  Eye,
  FolderClosed,
  CheckCircle2,
  Calendar,
  RotateCw,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  onNewRecord: (type?: 'text' | 'photo' | 'audio' | 'video' | 'document') => void;
  onSelectRecord: (record: DiaryRecord) => void;
  onViewAllRecords: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
  onEditPhoto?: (record: DiaryRecord, photoUrl: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  records,
  onNewRecord,
  onSelectRecord,
  onViewAllRecords,
  onOpenPdf,
  onEditPhoto,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const recentRecords = activeRecords.slice(0, 10);

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

                {/* Media Presentation (Accelerated, Zero Crop, Direct Streaming) */}
                <MediaFeedRenderer
                  record={record}
                  onOpenPdf={onOpenPdf}
                  onEditPhoto={onEditPhoto}
                  mode="feed"
                />
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
