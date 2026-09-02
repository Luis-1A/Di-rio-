import React, { useState, useMemo } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import {
  Search,
  FolderClosed,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  Play,
  Pause,
  SlidersHorizontal,
  Plus,
  X,
  Eye,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface ArchiveViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
  onNewRecord: (type?: 'text' | 'photo' | 'audio' | 'video' | 'document') => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
}

type ArchiveFilterType = 'all' | 'text' | 'photo' | 'video' | 'audio' | 'document';

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  user,
  records,
  onSelectRecord,
  onNewRecord,
  onOpenPdf,
}) => {
  const [filterType, setFilterType] = useState<ArchiveFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioInstancesRef = React.useRef<Record<string, HTMLAudioElement>>({});

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return records.filter((rec) => {
      if (rec.isDeleted) return false;

      // Type Filter
      if (filterType !== 'all') {
        if (filterType === 'photo' && rec.type !== 'photo') return false;
        if (filterType === 'video' && rec.type !== 'video') return false;
        if (filterType === 'audio' && rec.type !== 'audio') return false;
        if (filterType === 'text' && rec.type !== 'text') return false;
        if (filterType === 'document' && rec.type !== 'document') return false;
      }

      // Search query
      if (q) {
        const titleMatch = (rec.title || '').toLowerCase().includes(q);
        const contentMatch = (rec.content || '').toLowerCase().includes(q);
        const tagsMatch = (rec.tags || []).some((t) => t.toLowerCase().includes(q));
        const fileMatch = (rec.attachments || []).some(
          (a) => a.name && a.name.toLowerCase().includes(q)
        );
        if (!titleMatch && !contentMatch && !tagsMatch && !fileMatch) {
          return false;
        }
      }

      return true;
    });
  }, [records, filterType, searchQuery]);

  // Group records by Date label ("Hoje", "Ontem", "28 de agosto", etc.)
  const groupedSections = useMemo<Record<string, DiaryRecord[]>>(() => {
    const groups: Record<string, DiaryRecord[]> = {};
    const now = new Date();

    filteredRecords.forEach((rec) => {
      const recDate = new Date(rec.createdAt || rec.date);

      const isToday =
        now.getFullYear() === recDate.getFullYear() &&
        now.getMonth() === recDate.getMonth() &&
        now.getDate() === recDate.getDate();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        yesterday.getFullYear() === recDate.getFullYear() &&
        yesterday.getMonth() === recDate.getMonth() &&
        yesterday.getDate() === recDate.getDate();

      let label = '';
      if (isToday) {
        label = 'Hoje';
      } else if (isYesterday) {
        label = 'Ontem';
      } else {
        label = recDate.toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'long',
        });
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(rec);
    });

    return groups;
  }, [filteredRecords]);

  const toggleAudio = (e: React.MouseEvent, recordId: string, audioUrl?: string) => {
    e.stopPropagation();
    if (!audioUrl) return;

    if (playingAudioId === recordId) {
      if (audioInstancesRef.current[recordId]) {
        audioInstancesRef.current[recordId].pause();
      }
      setPlayingAudioId(null);
    } else {
      Object.values(audioInstancesRef.current).forEach((a) => {
        if (a instanceof HTMLAudioElement) a.pause();
      });
      if (!audioInstancesRef.current[recordId]) {
        audioInstancesRef.current[recordId] = new Audio(audioUrl);
        audioInstancesRef.current[recordId].onended = () => setPlayingAudioId(null);
      }
      audioInstancesRef.current[recordId].play().catch(() => {});
      setPlayingAudioId(recordId);
    }
  };

  const formatItemTime = (dateStr?: string) => {
    try {
      const d = dateStr ? new Date(dateStr) : new Date();
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div id="archive-view" className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-4 relative">
      {/* 1. Header with Search */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <FolderClosed className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-800 leading-none">
              Arquivo & Registros
            </h2>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {filteredRecords.length} item(ns) encontrado(s)
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
          title="Buscar no arquivo"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar Input */}
      {isSearchOpen && (
        <div className="relative animate-in fade-in duration-150">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título, texto ou nome do arquivo..."
            autoFocus
            className="w-full bg-white border border-stone-200/90 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 shadow-xs"
          />
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 2. Top Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
            filterType === 'all'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          Todos
        </button>

        <button
          type="button"
          onClick={() => setFilterType('text')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'text'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <FileText className="w-3 h-3" />
          <span>Texto</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('photo')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'photo'
              ? 'bg-sky-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <ImageIcon className="w-3 h-3" />
          <span>Foto</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('audio')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'audio'
              ? 'bg-emerald-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Mic className="w-3 h-3" />
          <span>Áudio</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('video')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'video'
              ? 'bg-purple-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Video className="w-3 h-3" />
          <span>Vídeo</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('document')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'document'
              ? 'bg-amber-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <File className="w-3 h-3" />
          <span>PDF / Documento</span>
        </button>
      </div>

      {/* 3. Grouped Date List */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-stone-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs mt-4">
          <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mx-auto">
            <FolderClosed className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-stone-800">
              Nenhum registro encontrado
            </h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Nenhum item corresponde aos filtros selecionados.
            </p>
          </div>
          <button
            onClick={() => onNewRecord()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar novo registro</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          {Object.entries(groupedSections).map(([dateLabel, groupItems]) => (
            <div key={dateLabel} className="space-y-2.5">
              <h3 className="text-xs font-semibold text-stone-500 pl-1">
                {dateLabel}
              </h3>

              <div className="space-y-2">
                {(groupItems as DiaryRecord[]).map((rec) => {
                  const photoAtt = rec.attachments?.find((a) => a.type === 'image');
                  const videoAtt = rec.attachments?.find((a) => a.type === 'video');
                  const audioAtt = rec.attachments?.find((a) => a.type === 'audio');
                  const docAtt = rec.attachments?.find(
                    (a) =>
                      a.type === 'document' ||
                      (!photoAtt && !videoAtt && !audioAtt && a.url)
                  );
                  const isPDF =
                    docAtt?.name?.toLowerCase().endsWith('.pdf') ||
                    docAtt?.mimeType === 'application/pdf';

                  return (
                    <div
                      key={rec.id}
                      onClick={() => onSelectRecord(rec)}
                      className="bg-white hover:bg-stone-50/70 border border-stone-200/80 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-[0_1px_6px_rgba(0,0,0,0.02)] transition-all cursor-pointer group"
                    >
                      {/* Left: Thumbnail & Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 1. Photo Thumbnail */}
                        {(photoAtt?.url || (rec.type === 'photo' && (rec.downloadUrl || rec.thumbnailUrl))) && (
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/60 shrink-0">
                            <img
                              src={photoAtt?.url || rec.downloadUrl || rec.thumbnailUrl}
                              alt={rec.title || 'Foto'}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}

                        {/* 2. Video Thumbnail */}
                        {(videoAtt?.url || (rec.type === 'video' && (rec.downloadUrl || rec.thumbnailUrl))) && !photoAtt && (
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-900 shrink-0 relative flex items-center justify-center">
                            {rec.thumbnailUrl ? (
                              <img
                                src={rec.thumbnailUrl}
                                alt={rec.title || 'Vídeo'}
                                className="w-full h-full object-cover opacity-80"
                              />
                            ) : (
                              <video
                                src={videoAtt?.url || rec.downloadUrl}
                                className="w-full h-full object-cover opacity-75"
                              />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                          </div>
                        )}

                        {/* 3. Audio Icon */}
                        {audioAtt && !photoAtt && !videoAtt && (
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                            <Mic className="w-4 h-4" />
                          </div>
                        )}

                        {/* 4. Document Icon */}
                        {docAtt && !photoAtt && !videoAtt && !audioAtt && (
                          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                            <File className="w-4 h-4" />
                          </div>
                        )}

                        {/* 5. Text Icon */}
                        {!photoAtt && !videoAtt && !audioAtt && !docAtt && (
                          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0 border border-stone-200">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}

                        {/* Text Details */}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-stone-800 truncate group-hover:text-orange-700 transition-colors">
                            {rec.title ||
                              (rec.type === 'text' ? 'Anotação' : 'Registro')}
                          </h4>

                          {/* Audio Player in item if audio */}
                          {audioAtt ? (
                            <div
                              onClick={(e) =>
                                toggleAudio(e, rec.id, audioAtt.url)
                              }
                              className="flex items-center gap-2 mt-1"
                            >
                              <button
                                type="button"
                                className="text-emerald-700 hover:text-emerald-800 cursor-pointer"
                              >
                                {playingAudioId === rec.id ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                              <div className="w-24 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full bg-emerald-500 ${
                                    playingAudioId === rec.id
                                      ? 'w-2/3 animate-pulse'
                                      : 'w-1/3'
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] text-stone-400 font-mono">
                                Áudio
                              </span>
                            </div>
                          ) : (
                            <p className="text-[11px] text-stone-500 truncate mt-0.5">
                              {rec.type === 'photo'
                                ? 'Foto salva'
                                : rec.type === 'video'
                                ? 'Vídeo salvo'
                                : rec.type === 'document'
                                ? `${isPDF ? 'PDF' : 'Arquivo'} ${docAtt?.size ? `• ${(docAtt.size / (1024 * 1024)).toFixed(1)} MB` : ''}`
                                : rec.content || 'Texto'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: PDF Quick Button & Time & Sync */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isPDF && docAtt && onOpenPdf && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPdf(
                                docAtt.url,
                                rec.title || docAtt.name || 'Documento PDF',
                                docAtt.name,
                                docAtt.size
                              );
                            }}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Abrir PDF"
                          >
                            <Eye className="w-3 h-3" />
                            <span className="hidden sm:inline">Ver PDF</span>
                          </button>
                        )}

                        <div className="flex items-center gap-1.5 text-right">
                          <span className="text-[11px] text-stone-400 font-normal">
                            {formatItemTime(rec.createdAt)}
                          </span>
                          {rec.syncStatus === 'pending' ? (
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" title="Aguardando sincronização" />
                          ) : rec.syncStatus === 'failed' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Pendente" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" title="Sincronizado na Nuvem" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Filter Button */}
      <button
        onClick={() =>
          setFilterType((prev) => (prev === 'all' ? 'photo' : 'all'))
        }
        title="Filtrar fotos"
        className="fixed right-5 bottom-20 md:bottom-8 w-11 h-11 rounded-full bg-white border border-stone-200/90 shadow-md flex items-center justify-center text-stone-700 hover:text-orange-600 hover:bg-stone-50 transition-transform active:scale-95 cursor-pointer z-20"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
};
