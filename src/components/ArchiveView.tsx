import React, { useState, useMemo } from 'react';
import { DiaryRecord, RecordType, UserProfile } from '../types';
import {
  saveRecord,
  softDeleteRecord,
  restoreRecord,
  permanentlyDeleteRecord,
} from '../lib/firestoreService';
import {
  Search,
  Filter,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  Star,
  Trash2,
  RotateCcw,
  Tag,
  Folder,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';

interface ArchiveViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
  onNewRecord: () => void;
}

type ArchiveFilterType = 'all' | 'photo' | 'video' | 'audio' | 'text' | 'document' | 'favorites' | 'trash';

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  user,
  records,
  onSelectRecord,
  onNewRecord,
}) => {
  const [filterType, setFilterType] = useState<ArchiveFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Categories extracted dynamically from records
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return records.filter((rec) => {
      // 1. Trash vs Active
      if (filterType === 'trash') {
        if (!rec.isDeleted) return false;
      } else {
        if (rec.isDeleted) return false;
      }

      // 2. Type Filter
      if (filterType === 'favorites') {
        if (!rec.isFavorite) return false;
      } else if (filterType === 'photo' && rec.type !== 'photo') {
        return false;
      } else if (filterType === 'video' && rec.type !== 'video') {
        return false;
      } else if (filterType === 'audio' && rec.type !== 'audio') {
        return false;
      } else if (filterType === 'text' && rec.type !== 'text') {
        return false;
      } else if (filterType === 'document' && rec.type !== 'document') {
        return false;
      }

      // 3. Category Filter
      if (selectedCategory !== 'all' && rec.category !== selectedCategory) {
        return false;
      }

      // 4. Deep Search: title, content, tags, audio transcripts!
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
  }, [records, filterType, selectedCategory, searchQuery]);

  const handleToggleFavorite = async (e: React.MouseEvent, rec: DiaryRecord) => {
    e.stopPropagation();
    try {
      await saveRecord(user.uid, {
        ...rec,
        isFavorite: !rec.isFavorite,
      });
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleSoftDelete = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    try {
      await softDeleteRecord(user.uid, recordId);
    } catch (err) {
      console.error('Failed to move to trash:', err);
    }
  };

  const handleRestore = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    try {
      await restoreRecord(user.uid, recordId);
    } catch (err) {
      console.error('Failed to restore record:', err);
    }
  };

  const handlePermanentDelete = async (e: React.MouseEvent, rec: DiaryRecord) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      'Tem certeza de que deseja excluir permanentemente este registro? Esta ação não pode ser desfeita.'
    );
    if (confirmed) {
      try {
        await permanentlyDeleteRecord(user.uid, rec.id, rec.attachments);
      } catch (err) {
        console.error('Failed to delete permanently:', err);
      }
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getRecordIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return <ImageIcon className="w-4 h-4 text-sky-400" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <Video className="w-4 h-4 text-purple-400" />;
      case 'document':
        return <File className="w-4 h-4 text-amber-400" />;
      default:
        return <FileText className="w-4 h-4 text-stone-300" />;
    }
  };

  return (
    <div id="archive-view-container" className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif text-stone-100">Arquivo Pessoal</h2>
          <p className="text-xs text-stone-400">
            {filteredRecords.length} registro(s) encontrados
          </p>
        </div>

        {/* Global Search Box */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
          <input
            id="input-archive-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar registros, áudios, tags..."
            className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-stone-500 hover:text-stone-300"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-stone-800">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'all'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setFilterType('text')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'text'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Textos
        </button>
        <button
          onClick={() => setFilterType('photo')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'photo'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Fotos
        </button>
        <button
          onClick={() => setFilterType('audio')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'audio'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Áudios
        </button>
        <button
          onClick={() => setFilterType('video')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'video'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Vídeos
        </button>
        <button
          onClick={() => setFilterType('document')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'document'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          Documentos
        </button>
        <button
          onClick={() => setFilterType('favorites')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            filterType === 'favorites'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span>Favoritos</span>
        </button>
        <button
          onClick={() => setFilterType('trash')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            filterType === 'trash'
              ? 'bg-red-950/60 text-red-300 border border-red-800 font-semibold'
              : 'bg-stone-900 border border-stone-800 text-stone-500 hover:text-red-400'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Lixeira</span>
        </button>
      </div>

      {/* Category Subfilter */}
      {availableCategories.length > 0 && filterType !== 'trash' && (
        <div className="flex items-center gap-2 overflow-x-auto text-xs text-stone-400">
          <span className="shrink-0 text-stone-500">Categoria:</span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              selectedCategory === 'all'
                ? 'bg-stone-800 text-stone-100 font-semibold'
                : 'hover:bg-stone-900 text-stone-400'
            }`}
          >
            Todas
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-stone-800 text-stone-100 font-semibold'
                  : 'hover:bg-stone-900 text-stone-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid of Records */}
      {filteredRecords.length === 0 ? (
        <div className="bg-stone-900/30 border border-stone-800/60 rounded-2xl p-12 text-center">
          <Layers className="w-10 h-10 text-stone-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-300">
            {filterType === 'trash'
              ? 'A lixeira está vazia'
              : 'Nenhum registro encontrado nesta categoria'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            {filterType === 'trash'
              ? 'Itens excluídos temporariamente aparecerão aqui.'
              : 'Tente mudar os filtros de pesquisa ou crie um novo registro.'}
          </p>
          {filterType !== 'trash' && (
            <button
              onClick={onNewRecord}
              className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl text-xs font-bold transition-colors"
            >
              + Novo Registro
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecords.map((rec) => {
            const firstImage = (rec.attachments || []).find((a) => a.type === 'image');
            const hasAudio = (rec.attachments || []).some((a) => a.type === 'audio');

            return (
              <div
                key={rec.id}
                onClick={() => onSelectRecord(rec)}
                className="bg-stone-900/90 hover:bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-2xl p-4 transition-all cursor-pointer group flex flex-col justify-between shadow-md"
              >
                <div>
                  {/* Image banner if photo attached */}
                  {firstImage && firstImage.url && (
                    <img
                      src={firstImage.url}
                      alt={firstImage.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-cover rounded-xl mb-3 border border-stone-800/80"
                    />
                  )}

                  {/* Header info */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-stone-950 border border-stone-800">
                        {getRecordIcon(rec.type)}
                      </div>
                      <span className="text-[11px] text-stone-500">{formatDate(rec.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {rec.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 text-stone-400 font-medium">
                          {rec.category}
                        </span>
                      )}
                      {filterType !== 'trash' && (
                        <button
                          onClick={(e) => handleToggleFavorite(e, rec)}
                          className={`p-1 rounded hover:bg-stone-800 transition-colors ${
                            rec.isFavorite ? 'text-amber-400' : 'text-stone-600 hover:text-stone-400'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-sm text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-1">
                    {rec.title || 'Sem título'}
                  </h3>

                  <p className="text-xs text-stone-400 mt-2 line-clamp-3 leading-relaxed">
                    {rec.content || '(Sem descrição textual)'}
                  </p>

                  {/* Audio transcript badge */}
                  {hasAudio && (
                    <div className="mt-2.5 flex items-center gap-1 text-[11px] text-emerald-400/90 font-medium">
                      <Mic className="w-3 h-3" />
                      <span>Áudio com transcrição integrada</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-stone-800/70 flex items-center justify-between text-xs">
                  {rec.tags && rec.tags.length > 0 ? (
                    <div className="flex items-center gap-1 truncate max-w-[160px]">
                      {rec.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[10px] text-amber-500/80">
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-1">
                    {filterType === 'trash' ? (
                      <>
                        <button
                          onClick={(e) => handleRestore(e, rec.id)}
                          title="Restaurar registro"
                          className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-emerald-400 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handlePermanentDelete(e, rec)}
                          title="Excluir definitivamente"
                          className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => handleSoftDelete(e, rec.id)}
                        title="Mover para lixeira"
                        className="p-1.5 rounded-lg text-stone-600 hover:text-red-400 hover:bg-stone-800/80 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
