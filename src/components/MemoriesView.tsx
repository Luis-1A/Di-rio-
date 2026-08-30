import React, { useState } from 'react';
import { MemoryItem, UserProfile } from '../types';
import { saveMemory, deleteMemory } from '../lib/firestoreService';
import {
  Bookmark,
  Sparkles,
  Plus,
  Trash2,
  Tag,
  ShieldAlert,
  Search,
  CheckCircle,
} from 'lucide-react';

interface MemoriesViewProps {
  user: UserProfile;
  memories: MemoryItem[];
}

export const MemoriesView: React.FC<MemoriesViewProps> = ({ user, memories }) => {
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<MemoryItem['category']>('thought');
  const [saving, setSaving] = useState(false);

  const filteredMemories = memories.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.summary.toLowerCase().includes(q) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) return;

    setSaving(true);
    try {
      await saveMemory(user.uid, {
        title: title.trim(),
        summary: summary.trim(),
        category,
        confidence: 1.0,
        sourceType: 'record',
        tags: [],
      });
      setTitle('');
      setSummary('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create manual memory:', err);
      alert('Falha ao salvar memória no Firebase.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    const conf = window.confirm('Deseja excluir esta memória da IAU Central?');
    if (conf) {
      try {
        await deleteMemory(user.uid, memoryId);
      } catch (err) {
        console.error('Failed to delete memory:', err);
      }
    }
  };

  return (
    <div id="memories-view-container" className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif text-stone-100 flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-400" />
            <span>Memórias de Longo Prazo</span>
          </h2>
          <p className="text-xs text-stone-400">
            Conhecimento estruturado e indexado que a IAU utiliza para compreender seu contexto
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar memórias..."
              className="bg-stone-900 border border-stone-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
      </div>

      {/* Manual Memory Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateMemory}
          className="p-5 rounded-2xl bg-stone-900 border border-stone-800 space-y-4 shadow-xl"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Adicionar Nova Memória Permanente
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da memória (ex: Preferência por café sem açúcar)"
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            >
              <option value="preference">Preferência</option>
              <option value="life_event">Evento de Vida</option>
              <option value="project">Projeto</option>
              <option value="relationship">Relação / Pessoa</option>
              <option value="thought">Pensamento</option>
              <option value="habit">Hábito</option>
            </select>
          </div>

          <textarea
            required
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Resumo objetivo da memória para a IAU..."
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-100 focus:outline-none focus:border-amber-500 resize-none"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-xl bg-stone-800 text-stone-300 text-xs hover:bg-stone-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs"
            >
              {saving ? 'Salvando...' : 'Salvar Memória'}
            </button>
          </div>
        </form>
      )}

      {/* Memories List */}
      {filteredMemories.length === 0 ? (
        <div className="bg-stone-900/30 border border-stone-800/60 rounded-2xl p-12 text-center text-stone-500">
          <Bookmark className="w-10 h-10 text-stone-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-300">Nenhuma memória indexada</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            A IAU cria memórias automaticamente durante conversas importantes ou você pode adicionar manualmente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 text-amber-400">
                    {mem.category}
                  </span>
                  <span className="text-[10px] text-stone-500">
                    {new Date(mem.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <h4 className="font-semibold text-sm text-stone-100">{mem.title}</h4>
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">{mem.summary}</p>
              </div>

              <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-xs">
                <span className="text-[11px] text-stone-500">
                  Origem: {mem.sourceType === 'conversation' ? 'Conversa IAU' : 'Registro'}
                </span>

                <button
                  onClick={() => handleDelete(mem.id)}
                  className="p-1 text-stone-500 hover:text-red-400 rounded transition-colors"
                  title="Excluir memória"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
