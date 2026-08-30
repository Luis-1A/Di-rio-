import React, { useState } from 'react';
import { MemoryItem, UserProfile } from '../types';
import { saveMemory, deleteMemory } from '../lib/firestoreService';
import {
  Bookmark,
  Plus,
  Trash2,
  Search,
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
      alert('Falha ao salvar memória.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    const conf = window.confirm('Deseja excluir esta memória?');
    if (conf) {
      try {
        await deleteMemory(user.uid, memoryId);
      } catch (err) {
        console.error('Failed to delete memory:', err);
      }
    }
  };

  const categoryLabels: Record<string, string> = {
    preference: 'Preferência',
    life_event: 'Momento',
    project: 'Projeto',
    relationship: 'Pessoa / Relação',
    thought: 'Pensamento',
    habit: 'Hábito',
  };

  return (
    <div id="memories-view-container" className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-800 flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-600" />
            <span>Memórias Guardadas</span>
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Lembranças e preferências que o assistente recorda para ajudar você
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar memórias..."
              className="bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Memória</span>
          </button>
        </div>
      </div>

      {/* Manual Memory Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateMemory}
          className="p-5 rounded-2xl bg-white border border-stone-200/90 space-y-4 shadow-xs"
        >
          <h3 className="text-xs font-semibold text-stone-700">
            Adicionar memória pessoal
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título (ex: Gosto de café sem açúcar)"
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:outline-none focus:border-amber-500"
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:outline-none focus:border-amber-500"
            >
              <option value="preference">Preferência</option>
              <option value="life_event">Momento de Vida</option>
              <option value="project">Projeto</option>
              <option value="relationship">Pessoa / Relação</option>
              <option value="thought">Pensamento</option>
              <option value="habit">Hábito</option>
            </select>
          </div>

          <textarea
            required
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Descreva a memória ou fato que você deseja lembrar..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-800 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-xs hover:bg-stone-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar Memória'}
            </button>
          </div>
        </form>
      )}

      {/* Memories List */}
      {filteredMemories.length === 0 ? (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-12 text-center text-stone-400 space-y-2">
          <Bookmark className="w-8 h-8 text-stone-300 mx-auto" />
          <h3 className="text-sm font-medium text-stone-700">Nenhuma memória encontrada</h3>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            O assistente guarda momentos especiais durante conversas ou você pode adicionar memórias quando desejar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="bg-white border border-stone-200/90 hover:border-amber-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100/80">
                    {categoryLabels[mem.category] || mem.category}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {new Date(mem.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <h4 className="font-semibold text-sm text-stone-800">{mem.title}</h4>
                <p className="text-xs text-stone-600 mt-1 leading-relaxed">{mem.summary}</p>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-[11px] text-stone-400">
                  {mem.sourceType === 'conversation' ? 'Gravado da conversa' : 'Registro manual'}
                </span>

                <button
                  onClick={() => handleDelete(mem.id)}
                  className="p-1 text-stone-400 hover:text-red-600 rounded transition-colors cursor-pointer"
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
