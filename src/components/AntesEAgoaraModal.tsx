import React, { useState } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import { addRecordReflection } from '../lib/firestoreService';
import {
  GitCompare,
  X,
  Calendar,
  Send,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';

interface AntesEAgoaraModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  records: DiaryRecord[];
  initialRecord?: DiaryRecord | null;
  onRecordUpdated?: (updated: DiaryRecord) => void;
}

export const AntesEAgoaraModal: React.FC<AntesEAgoaraModalProps> = ({
  isOpen,
  onClose,
  user,
  records,
  initialRecord,
  onRecordUpdated,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(() => {
    if (initialRecord) {
      const idx = activeRecords.findIndex((r) => r.id === initialRecord.id);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  const [reflectionText, setReflectionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  if (!isOpen) return null;

  const currentRecord = activeRecords[selectedRecordIndex] || null;

  const handleNextRecord = () => {
    if (selectedRecordIndex < activeRecords.length - 1) {
      setSelectedRecordIndex((prev) => prev + 1);
      setShowInput(false);
    }
  };

  const handlePrevRecord = () => {
    if (selectedRecordIndex > 0) {
      setSelectedRecordIndex((prev) => prev - 1);
      setShowInput(false);
    }
  };

  const handleSaveReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRecord || !reflectionText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const updated = await addRecordReflection(user.uid, currentRecord, reflectionText.trim());
      if (onRecordUpdated) {
        onRecordUpdated(updated);
      }
      setReflectionText('');
      setShowInput(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      console.error('Error adding reflection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const photoAtt = currentRecord?.attachments?.find((a) => a.type === 'image');
  const reflections = currentRecord?.reflections || [];
  const latestReflection = reflections[reflections.length - 1];

  return (
    <div className="fixed inset-0 z-50 bg-[#080D1B]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0D1322] border border-stone-800 rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="px-6 py-4 bg-[#080D1B] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C9A4DC]/20 text-[#C9A4DC] flex items-center justify-center">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">
                Antes e agora
              </h2>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Revise uma opinião e perceba sua própria evolução
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeRecords.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-xs text-stone-400">
                Você ainda não possui registros para comparar no Antes e Agora.
              </p>
            </div>
          ) : !currentRecord ? null : (
            <>
              {/* Record Selector Pager */}
              <div className="flex items-center justify-between text-xs text-stone-400 pb-1">
                <button
                  type="button"
                  onClick={handlePrevRecord}
                  disabled={selectedRecordIndex === 0}
                  className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>

                <span className="font-mono text-[11px] text-stone-400">
                  {selectedRecordIndex + 1} de {activeRecords.length}
                </span>

                <button
                  type="button"
                  onClick={handleNextRecord}
                  disabled={selectedRecordIndex === activeRecords.length - 1}
                  className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  <span>Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Side-by-side comparison (Antes vs. Agora) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Left Card: ANTES */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#C9A4DC] font-semibold">
                        Antes
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {new Date(currentRecord.date || currentRecord.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white">
                      {currentRecord.title || 'Momento registrado'}
                    </h4>

                    {photoAtt && (
                      <div className="w-full h-32 rounded-xl overflow-hidden bg-black/40">
                        <img
                          src={photoAtt.url}
                          alt="Foto original"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    <div className="text-xs text-stone-300 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5 font-serif">
                      "{currentRecord.content || 'Sem texto anotado.'}"
                    </div>
                  </div>

                  <div className="text-[10px] text-stone-500 font-mono">
                    Registrado em {currentRecord.date || 'data original'}
                  </div>
                </div>

                {/* Right Card: HOJE / AGORA */}
                <div className="bg-[#1A2238]/60 border border-[#C9A4DC]/30 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                        Hoje
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {new Date().toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white">
                      Sua visão e maturidade atual
                    </h4>

                    {latestReflection ? (
                      <div className="text-xs text-emerald-100 leading-relaxed italic bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/20 font-serif">
                        "{latestReflection.content}"
                      </div>
                    ) : (
                      <div className="text-xs text-stone-400 leading-relaxed p-3 rounded-xl bg-black/20 border border-white/5 italic">
                        Você ainda não adicionou uma reflexão atual sobre este momento. Como você o enxerga hoje?
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-stone-400">
                    {reflections.length} reflexão(ões) conectada(s)
                  </div>
                </div>
              </div>

              {/* Add Comment / Reflection Button & Form */}
              {!showInput ? (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowInput(true)}
                    className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-[#F4E4E1] text-[#080D1B] font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Adicionar comentário (Antes e Agora)</span>
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSaveReflection}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 animate-in fade-in"
                >
                  <label className="block text-xs font-semibold text-white">
                    O que você pensa hoje sobre o que viveu naquele dia?
                  </label>
                  <textarea
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    placeholder="Hoje, olhando para trás, vejo que..."
                    rows={3}
                    autoFocus
                    className="w-full p-3 bg-black/40 border border-white/20 rounded-xl text-xs text-white placeholder:text-stone-500 focus:outline-hidden focus:border-[#C9A4DC] resize-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInput(false)}
                      className="px-3 py-1.5 text-xs text-stone-400 hover:text-white cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!reflectionText.trim() || isSubmitting}
                      className="px-4 py-2 bg-[#C9A4DC] hover:bg-[#B88ECF] text-[#080D1B] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'Salvando...' : 'Salvar Reflexão'}</span>
                    </button>
                  </div>
                </form>
              )}

              {justSaved && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Reflexão salva com sucesso no registro!</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
