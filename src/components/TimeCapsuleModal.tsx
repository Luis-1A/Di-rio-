import React, { useState } from 'react';
import { TimeCapsule, UserProfile } from '../types';
import {
  createTimeCapsule,
  unlockTimeCapsule,
  deleteTimeCapsule,
} from '../lib/timeCapsuleService';
import {
  Hourglass,
  Lock,
  Unlock,
  Plus,
  X,
  Calendar,
  Sparkles,
  Send,
  Trash2,
  Mail,
  CheckCircle2,
  Clock,
  Heart,
} from 'lucide-react';

interface TimeCapsuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  capsules: TimeCapsule[];
  onCapsulesChanged: () => void;
}

export const TimeCapsuleModal: React.FC<TimeCapsuleModalProps> = ({
  isOpen,
  onClose,
  user,
  capsules,
  onCapsulesChanged,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCapsule, setSelectedCapsule] = useState<TimeCapsule | null>(null);

  // New Capsule Form State
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [theme, setTheme] = useState<'classic' | 'vintage' | 'stellar' | 'rose'>('vintage');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Future Reply Form State
  const [futureReply, setFutureReply] = useState('');
  const [isSavingReply, setIsSavingReply] = useState(false);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSetPresetDate = (monthsAhead: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsAhead);
    setUnlockDate(d.toISOString().split('T')[0]);
  };

  const handleCreateCapsule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim() || !unlockDate || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createTimeCapsule(user.uid, {
        title: newTitle.trim(),
        message: newMessage.trim(),
        unlockDate,
        theme,
      });
      onCapsulesChanged();
      setIsCreating(false);
      setNewTitle('');
      setNewMessage('');
      setUnlockDate('');
    } catch (err) {
      console.error('Error creating capsule:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockNow = async (capsule: TimeCapsule) => {
    await unlockTimeCapsule(user.uid, capsule.id);
    onCapsulesChanged();
    setSelectedCapsule({ ...capsule, isOpened: true, openedAt: new Date().toISOString() });
  };

  const handleSaveFutureReply = async (capsule: TimeCapsule) => {
    if (!futureReply.trim() || isSavingReply) return;
    setIsSavingReply(true);
    try {
      await unlockTimeCapsule(user.uid, capsule.id, futureReply.trim());
      onCapsulesChanged();
      setSelectedCapsule((prev) => (prev ? { ...prev, futureReply: futureReply.trim() } : null));
      setFutureReply('');
    } catch (err) {
      console.error('Error saving reply:', err);
    } finally {
      setIsSavingReply(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza de que deseja descartar esta cápsula do tempo?')) {
      await deleteTimeCapsule(user.uid, id);
      onCapsulesChanged();
      if (selectedCapsule?.id === id) {
        setSelectedCapsule(null);
      }
    }
  };

  const isUnlockReady = (dateStr: string) => {
    return dateStr <= todayStr;
  };

  const getDaysRemaining = (dateStr: string) => {
    const target = new Date(dateStr).getTime();
    const now = new Date(todayStr).getTime();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#FAF8F5] border border-stone-200/90 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-stone-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
              <Hourglass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">Cápsula do Tempo</h2>
              <p className="text-xs text-stone-500">Escreva para o seu Eu do Futuro</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* View Details of a Capsule */}
          {selectedCapsule ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelectedCapsule(null)}
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer"
              >
                ← Voltar para a lista de cápsulas
              </button>

              <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500">
                    Escrita em{' '}
                    {new Date(selectedCapsule.createdAt).toLocaleDateString('pt-BR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>

                  {selectedCapsule.isOpened ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Aberta</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Trancada</span>
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-serif font-bold text-stone-900">
                  {selectedCapsule.title}
                </h3>

                {/* If still locked and not date yet */}
                {!selectedCapsule.isOpened && !isUnlockReady(selectedCapsule.unlockDate) ? (
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-amber-200/70 text-amber-800 flex items-center justify-center mx-auto shadow-inner">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">
                        Esta carta está selada no tempo
                      </h4>
                      <p className="text-xs text-stone-600 mt-1">
                        Ela se abrirá automaticamente em{' '}
                        <strong className="text-amber-950 font-semibold">
                          {new Date(selectedCapsule.unlockDate).toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </strong>
                        .
                      </p>
                      <p className="text-xs text-amber-800 font-medium mt-1">
                        Faltam {getDaysRemaining(selectedCapsule.unlockDate)} dias.
                      </p>
                    </div>
                  </div>
                ) : !selectedCapsule.isOpened && isUnlockReady(selectedCapsule.unlockDate) ? (
                  /* Ready to unlock */
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                      <Sparkles className="w-6 h-6 animate-bounce" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-emerald-950">
                        O momento chegou!
                      </h4>
                      <p className="text-xs text-emerald-800 mt-1">
                        A data de abertura que você definiu no passado foi alcançada.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnlockNow(selectedCapsule)}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      Abrir carta do passado
                    </button>
                  </div>
                ) : (
                  /* Capsule is OPENED -> Reveal content! */
                  <div className="space-y-4">
                    <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-5 space-y-2">
                      <div className="text-[11px] font-mono text-amber-800 uppercase tracking-wider font-semibold">
                        Mensagem do seu Eu do passado:
                      </div>
                      <div className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed font-serif">
                        {selectedCapsule.message}
                      </div>
                    </div>

                    {/* Future Reply Section */}
                    {selectedCapsule.futureReply ? (
                      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-5 space-y-1.5">
                        <div className="text-[11px] font-mono text-sky-800 uppercase tracking-wider font-semibold">
                          Sua resposta do presente:
                        </div>
                        <p className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed font-serif">
                          "{selectedCapsule.futureReply}"
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-2.5">
                        <label className="block text-xs font-bold text-stone-800">
                          Responder para o seu Eu do passado:
                        </label>
                        <textarea
                          value={futureReply}
                          onChange={(e) => setFutureReply(e.target.value)}
                          placeholder="Como a sua vida realmente está agora? O que você diria para quem escreveu essa carta?"
                          rows={3}
                          className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-orange-500 resize-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveFutureReply(selectedCapsule)}
                          disabled={!futureReply.trim() || isSavingReply}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
                        >
                          {isSavingReply ? 'Gravando resposta...' : 'Salvar Resposta do Futuro'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedCapsule.id)}
                    className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Descartar cápsula</span>
                  </button>
                </div>
              </div>
            </div>
          ) : isCreating ? (
            /* Creation Form */
            <form onSubmit={handleCreateCapsule} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-900">
                  Selar nova Cápsula do Tempo
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-stone-700">
                  Título ou Destinatário:
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Para quando eu tiver 25 anos, Sonhos para o próximo ano..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-hidden focus:border-orange-500 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-stone-700">
                  Sua mensagem sincera:
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="O que você está sentindo hoje? Quais são suas dúvidas, certezas, planos e esperanças? Como você imagina que estará sua vida quando abrir isto?"
                  rows={6}
                  required
                  className="w-full p-3.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-hidden focus:border-orange-500 resize-none shadow-2xs leading-relaxed"
                />
              </div>

              {/* Unlock Date Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-stone-700">
                  Quando você deseja abrir esta cápsula?
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(1)}
                    className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-orange-50 hover:border-orange-300 font-medium text-stone-700 cursor-pointer text-center"
                  >
                    Daqui a 1 mês
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(6)}
                    className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-orange-50 hover:border-orange-300 font-medium text-stone-700 cursor-pointer text-center"
                  >
                    Daqui a 6 meses
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(12)}
                    className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-orange-50 hover:border-orange-300 font-medium text-stone-700 cursor-pointer text-center"
                  >
                    Daqui a 1 ano
                  </button>
                </div>

                <div className="pt-1">
                  <input
                    type="date"
                    value={unlockDate}
                    min={todayStr}
                    onChange={(e) => setUnlockDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newMessage.trim() || !unlockDate || isSubmitting}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Selando cápsula...' : 'Selar Cápsula no Tempo'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* List of Capsules */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Suas Cápsulas ({capsules.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova Cápsula</span>
                </button>
              </div>

              {capsules.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-stone-800">
                      Nenhuma cápsula do tempo ainda
                    </h4>
                    <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1 leading-relaxed">
                      Escreva uma mensagem para si mesmo e escolha uma data futura. Quando o momento chegar, você receberá a surpresa de reencontrar quem você era.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar minha primeira cápsula</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {capsules.map((capsule) => {
                    const ready = isUnlockReady(capsule.unlockDate);
                    const daysLeft = getDaysRemaining(capsule.unlockDate);

                    return (
                      <div
                        key={capsule.id}
                        onClick={() => setSelectedCapsule(capsule)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs group ${
                          capsule.isOpened
                            ? 'bg-white border-stone-200/80 hover:border-stone-300'
                            : ready
                            ? 'bg-emerald-50/80 border-emerald-300 hover:bg-emerald-50'
                            : 'bg-amber-50/60 border-amber-200/80 hover:bg-amber-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {capsule.isOpened ? (
                              <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center">
                                <Unlock className="w-4 h-4" />
                              </div>
                            ) : ready ? (
                              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                <Sparkles className="w-4 h-4 animate-spin" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center">
                                <Lock className="w-4 h-4" />
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-bold text-stone-900 group-hover:text-orange-700 transition-colors">
                                {capsule.title}
                              </h4>
                              <p className="text-[11px] text-stone-500">
                                {capsule.isOpened
                                  ? `Aberta • ${new Date(capsule.openedAt || capsule.unlockDate).toLocaleDateString('pt-BR')}`
                                  : ready
                                  ? '🎉 Pronta para ser aberta agora!'
                                  : `Abre em ${new Date(capsule.unlockDate).toLocaleDateString('pt-BR')} (faltam ${daysLeft} dias)`}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs font-semibold text-orange-600 group-hover:translate-x-0.5 transition-transform">
                            {capsule.isOpened ? 'Ler carta →' : ready ? 'Abrir agora! →' : 'Ver status →'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
