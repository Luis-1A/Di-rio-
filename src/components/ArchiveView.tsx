import React, { useState, useMemo } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import {
  saveRecord,
  softDeleteRecord,
  restoreRecord,
  permanentlyDeleteRecord,
} from '../lib/firestoreService';
import {
  Search,
  BookOpen,
  FolderClosed,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  Star,
  Trash2,
  RotateCcw,
  Play,
  Pause,
  SlidersHorizontal,
  Plus,
  X,
} from 'lucide-react';

interface ArchiveViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
  onNewRecord: () => void;
}

type ArchiveFilterType = 'all' | 'text' | 'photo' | 'video' | 'audio' | 'document';

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  user,
  records,
  onSelectRecord,
  onNewRecord,
}) => {
  const [filterType, setFilterType] = useState<ArchiveFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

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
        const transcriptMatch = (rec.attachments || []).some(
          (a) => a.transcript && a.transcript.toLowerCase().includes(q)
        );
        if (!titleMatch && !contentMatch && !tagsMatch && !transcriptMatch) {
          return false;
        }
      }

      return true;
    });
  }, [records, filterType, searchQuery]);

  // Group records by Date label ("Hoje", "Ontem", "28 de agosto", "15 de agosto", etc.)
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
      setPlayingAudioId(null);
    } else {
      setPlayingAudioId(recordId);
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingAudioId(null);
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
    <div id="archive-view" className="max-w-md md:max-w-lg mx-auto px-4 py-4 space-y-4 relative">
      {/* 1. Header (Screen 4: Arquivo + Search) */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <FolderClosed className="w-4 h-4" />
          </div>
          <h2 className="text-base font-semibold text-stone-800">Arquivo</h2>
        </div>

        <button
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar Input (if open) */}
      {isSearchOpen && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título, texto ou transcrição..."
            autoFocus
            className="w-full bg-white border border-stone-200/80 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 shadow-xs"
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

      {/* 2. Top Filter Pills (Screen 4) */}
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
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <ImageIcon className="w-3 h-3" />
          <span>Foto</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('video')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'video'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Video className="w-3 h-3" />
          <span>Vídeo</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('audio')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'audio'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Mic className="w-3 h-3" />
          <span>Áudio</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('document')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
            filterType === 'document'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <File className="w-3 h-3" />
          <span>Arquivo</span>
        </button>
      </div>

      {/* 3. Grouped Date List */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-stone-100 rounded-3xl p-8 text-center space-y-3 shadow-xs mt-4">
          <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mx-auto">
            <FolderClosed className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-stone-800">Nenhum registro encontrado</h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Nenhum item corresponde aos filtros selecionados.
            </p>
          </div>
          <button
            onClick={onNewRecord}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar novo registro</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          {Object.entries(groupedSections).map(([dateLabel, groupItems]) => (
            <div key={dateLabel} className="space-y-2.5">
              {/* Date Group Heading (e.g. "Hoje", "Ontem", "28 de agosto") */}
              <h3 className="text-xs font-medium text-stone-500 pl-1">
                {dateLabel}
              </h3>

              {/* Group Items */}
              <div className="space-y-2">
                {(groupItems as DiaryRecord[]).map((rec) => {
                  const photoAtt = rec.attachments?.find((a) => a.type === 'image');
                  const videoAtt = rec.attachments?.find((a) => a.type === 'video');
                  const audioAtt = rec.attachments?.find((a) => a.type === 'audio');
                  const docAtt = rec.attachments?.find(
                    (a) => a.type === 'document' || (!photoAtt && !videoAtt && !audioAtt && a.url)
                  );

                  return (
                    <div
                      key={rec.id}
                      onClick={() => onSelectRecord(rec)}
                      className="bg-white hover:bg-stone-50/70 border border-stone-100 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-[0_1px_6px_rgba(0,0,0,0.02)] transition-all cursor-pointer group"
                    >
                      {/* Left: Icon or Thumbnail + Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 1. Photo Thumbnail */}
                        {photoAtt && (
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/60 shrink-0">
                            <img
                              src={photoAtt.url}
                              alt={rec.title || 'Foto'}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}

                        {/* 2. Video Thumbnail */}
                        {videoAtt && !photoAtt && (
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-900 shrink-0 relative flex items-center justify-center">
                            <video src={videoAtt.url} className="w-full h-full object-cover opacity-75" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/70 text-white px-1 rounded-xs font-mono">
                              00:42
                            </span>
                          </div>
                        )}

                        {/* 3. Audio Icon */}
                        {audioAtt && !photoAtt && !videoAtt && (
                          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 shrink-0">
                            <Mic className="w-4 h-4 text-stone-700" />
                          </div>
                        )}

                        {/* 4. Document Icon */}
                        {docAtt && !photoAtt && !videoAtt && !audioAtt && (
                          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-stone-500 shrink-0">
                            <File className="w-4 h-4 text-stone-600" />
                          </div>
                        )}

                        {/* 5. Text Icon */}
                        {!photoAtt && !videoAtt && !audioAtt && !docAtt && (
                          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-stone-500 shrink-0">
                            <FileText className="w-4 h-4 text-stone-600" />
                          </div>
                        )}

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-stone-800 truncate group-hover:text-orange-700 transition-colors">
                            {rec.title || (rec.type === 'text' ? 'Anotação' : 'Registro')}
                          </h4>

                          {/* Audio Player in item if audio */}
                          {audioAtt ? (
                            <div
                              onClick={(e) => toggleAudio(e, rec.id, audioAtt.url)}
                              className="flex items-center gap-2 mt-1"
                            >
                              <button
                                type="button"
                                className="text-stone-700 hover:text-orange-600 cursor-pointer"
                              >
                                {playingAudioId === rec.id ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                              <div className="w-24 h-2 bg-stone-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full bg-stone-400 ${
                                    playingAudioId === rec.id ? 'w-2/3 bg-orange-500 animate-pulse' : 'w-1/3'
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] text-stone-400 font-mono">01:24</span>
                            </div>
                          ) : (
                            <p className="text-[11px] text-stone-400 truncate mt-0.5">
                              {rec.type === 'photo'
                                ? 'Foto'
                                : rec.type === 'video'
                                ? 'Vídeo'
                                : rec.type === 'document'
                                ? `${docAtt?.name?.toUpperCase().endsWith('.PDF') ? 'PDF' : 'Arquivo'} • 1.2 MB`
                                : rec.content || 'Texto'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Time */}
                      <span className="text-[11px] text-stone-400 font-normal shrink-0">
                        {formatItemTime(rec.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Filter Button at Bottom Right (Screen 4) */}
      <button
        onClick={() => setFilterType((prev) => (prev === 'all' ? 'photo' : 'all'))}
        title="Filtrar"
        className="fixed right-5 bottom-20 md:bottom-8 w-11 h-11 rounded-full bg-white border border-stone-200/90 shadow-md flex items-center justify-center text-stone-700 hover:text-orange-600 hover:bg-stone-50 transition-transform active:scale-95 cursor-pointer z-20"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
};
