import React, { useState, useMemo } from 'react';
import { DiaryRecord } from '../types';
import {
  Search,
  X,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  Calendar,
} from 'lucide-react';

interface SearchMemoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
}

type FilterCategory = 'all' | 'text' | 'photo' | 'video';

export const SearchMemoriesModal: React.FC<SearchMemoriesModalProps> = ({
  isOpen,
  onClose,
  records,
  onSelectRecord,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterCategory>('all');

  const filteredResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    const active = records.filter((r) => !r.isDeleted);

    return active.filter((r) => {
      // Filter by type
      if (filter === 'photo' && r.type !== 'photo') return false;
      if (filter === 'video' && r.type !== 'video') return false;
      if (filter === 'text' && r.type !== 'text') return false;

      // Filter by query
      if (!q) return true;

      const titleMatch = (r.title || '').toLowerCase().includes(q);
      const contentMatch = (r.content || '').toLowerCase().includes(q);
      const dateMatch = (r.date || '').includes(q);
      const categoryMatch = (r.category || '').toLowerCase().includes(q);
      const tagMatch = (r.tags || []).some((t) => t.toLowerCase().includes(q));
      const fileMatch = (r.attachments || []).some(
        (a) => a.name && a.name.toLowerCase().includes(q)
      );

      return titleMatch || contentMatch || dateMatch || categoryMatch || tagMatch || fileMatch;
    });
  }, [records, query, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#080D1B]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#0D1322] border border-stone-800 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Search Header */}
        <div className="p-4 bg-[#080D1B] border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-[#C9A4DC]" />
              <span>Busca de memórias</span>
            </h2>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por palavras, datas, lugares, pessoas..."
              autoFocus
              className="w-full bg-white/10 border border-white/15 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder:text-stone-400 focus:outline-hidden focus:border-[#C9A4DC]"
            />
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-[#080D1B]'
                  : 'bg-white/10 text-stone-300 hover:bg-white/20'
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => setFilter('text')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'text'
                  ? 'bg-white text-[#080D1B]'
                  : 'bg-white/10 text-stone-300 hover:bg-white/20'
              }`}
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => setFilter('photo')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'photo'
                  ? 'bg-white text-[#080D1B]'
                  : 'bg-white/10 text-stone-300 hover:bg-white/20'
              }`}
            >
              Fotos
            </button>
            <button
              type="button"
              onClick={() => setFilter('video')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'video'
                  ? 'bg-white text-[#080D1B]'
                  : 'bg-white/10 text-stone-300 hover:bg-white/20'
              }`}
            >
              Vídeos
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          <div className="text-[11px] font-semibold text-stone-400 pl-1 uppercase tracking-wider">
            Resultados ({filteredResults.length})
          </div>

          {filteredResults.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Search className="w-8 h-8 text-stone-600 mx-auto" />
              <p className="text-xs text-stone-400">
                Nenhuma memória encontrada para esta busca.
              </p>
            </div>
          ) : (
            filteredResults.map((rec) => {
              const photoAtt = rec.attachments?.find((a) => a.type === 'image');
              return (
                <div
                  key={rec.id}
                  onClick={() => {
                    onClose();
                    onSelectRecord(rec);
                  }}
                  className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-between gap-3 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {photoAtt ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 shrink-0">
                        <img
                          src={photoAtt.url}
                          alt={rec.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-white/10 text-[#C9A4DC] flex items-center justify-center shrink-0">
                        {rec.type === 'audio' ? (
                          <Mic className="w-4 h-4" />
                        ) : rec.type === 'video' ? (
                          <Video className="w-4 h-4" />
                        ) : rec.type === 'document' ? (
                          <File className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white group-hover:text-[#C9A4DC] transition-colors truncate">
                        {rec.title || 'Momento registrado'}
                      </h4>
                      <p className="text-[11px] text-stone-400 truncate mt-0.5">
                        {rec.content || `${rec.type} salvo no diário`}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] text-stone-500 font-mono shrink-0">
                    {new Date(rec.date || rec.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
