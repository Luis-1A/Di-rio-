import React, { useState } from 'react';
import { DiaryRecord, MonthlyRetrospective } from '../types';
import {
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Mic,
  Calendar,
  Tag,
  BookOpen,
  Share2,
  Check,
} from 'lucide-react';

interface MonthlyRetrospectiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  retrospective: MonthlyRetrospective;
  onOpenRecord?: (record: DiaryRecord) => void;
}

export const MonthlyRetrospectiveModal: React.FC<MonthlyRetrospectiveModalProps> = ({
  isOpen,
  onClose,
  retrospective,
  onOpenRecord,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [copiedShare, setCopiedShare] = useState(false);

  if (!isOpen) return null;

  const totalSlides = 4;

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleShareSummary = () => {
    const text = `✨ Minha Retrospectiva de ${retrospective.monthLabel} no Diário Pessoal:\n` +
      `📖 ${retrospective.totalRecords} momentos eternizados\n` +
      `📸 ${retrospective.photosCount} fotos guardadas\n` +
      `🎙️ ${retrospective.audiosCount} áudios gravados\n` +
      `🗓️ ${retrospective.activeDaysCount} dias de história viva.\n` +
      `"${retrospective.poeticSummary}"`;
    navigator.clipboard?.writeText(text);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-white aspect-[9/16] max-h-[85vh]">
        {/* Top Progress Bars (Stories Style) */}
        <div className="absolute top-3 left-4 right-4 z-20 flex gap-1.5">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden"
            >
              <div
                className={`h-full bg-white transition-all duration-300 ${
                  idx < currentSlide
                    ? 'w-full'
                    : idx === currentSlide
                    ? 'w-full animate-pulse'
                    : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Top Header */}
        <div className="absolute top-7 left-4 right-4 z-20 flex items-center justify-between text-xs font-medium text-stone-300">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Retrospectiva Pessoal</span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide 0: Cover / Title & Feeling */}
        {currentSlide === 0 && (
          <div className="flex-1 flex flex-col justify-between p-7 pt-20 bg-gradient-to-b from-orange-950/90 via-stone-900 to-black animate-in fade-in">
            <div className="space-y-4 pt-8">
              <span className="text-xs uppercase font-mono tracking-widest text-orange-300">
                Memórias de um Mês
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-white tracking-tight leading-tight">
                {retrospective.monthLabel}
              </h2>
              <p className="text-sm text-stone-300 leading-relaxed font-sans">
                {retrospective.poeticSummary}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Total de vivências guardadas</span>
                <span className="text-sm font-bold text-orange-400 font-mono">
                  {retrospective.totalRecords} momentos
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Dias com memórias ativas</span>
                <span className="text-sm font-bold text-white font-mono">
                  {retrospective.activeDaysCount} dias
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Slide 1: Media & Expressions Breakdown */}
        {currentSlide === 1 && (
          <div className="flex-1 flex flex-col justify-between p-7 pt-20 bg-gradient-to-b from-amber-950/80 via-stone-900 to-black animate-in fade-in">
            <div className="space-y-3 pt-4">
              <span className="text-xs uppercase font-mono tracking-widest text-amber-300">
                Como você expressou sua vida
              </span>
              <h3 className="text-2xl font-serif font-bold text-white">
                Cores, sons e pensamentos
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 my-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1">
                <ImageIcon className="w-6 h-6 text-sky-400 mx-auto mb-2" />
                <div className="text-2xl font-bold font-mono text-white">
                  {retrospective.photosCount}
                </div>
                <div className="text-xs text-stone-400">Fotografias</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1">
                <Mic className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <div className="text-2xl font-bold font-mono text-white">
                  {retrospective.audiosCount}
                </div>
                <div className="text-xs text-stone-400">Áudios & Voz</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1">
                <BookOpen className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                <div className="text-2xl font-bold font-mono text-white">
                  {retrospective.totalRecords - retrospective.photosCount - retrospective.audiosCount}
                </div>
                <div className="text-xs text-stone-400">Anotações</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1">
                <Calendar className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold font-mono text-white">
                  {retrospective.activeDaysCount}
                </div>
                <div className="text-xs text-stone-400">Dias Marcantes</div>
              </div>
            </div>

            <p className="text-xs text-stone-400 text-center">
              Cada dia registrado foi uma vitória de presença pessoal.
            </p>
          </div>
        )}

        {/* Slide 2: Topics, Tags & Focal Themes */}
        {currentSlide === 2 && (
          <div className="flex-1 flex flex-col justify-between p-7 pt-20 bg-gradient-to-b from-stone-900 via-stone-900 to-black animate-in fade-in">
            <div className="space-y-3 pt-4">
              <span className="text-xs uppercase font-mono tracking-widest text-sky-300">
                Temas & Assuntos
              </span>
              <h3 className="text-2xl font-serif font-bold text-white">
                O que esteve na sua mente
              </h3>
              <p className="text-xs text-stone-400">
                Seus tópicos e categorias mais presentes ao longo do mês:
              </p>
            </div>

            <div className="space-y-4 my-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                <span className="text-[11px] text-stone-400 font-mono">Categoria Principal</span>
                <div className="text-lg font-bold text-orange-300 capitalize">
                  {retrospective.topCategory}
                </div>
              </div>

              {retrospective.topTags.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs text-stone-400">Tags mais exploradas:</span>
                  <div className="flex flex-wrap gap-2">
                    {retrospective.topTags.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-white/10 text-white rounded-full text-xs font-mono border border-white/10"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-stone-400 text-center italic">
              "Reconhecer padrões é o primeiro passo para o autoconhecimento."
            </p>
          </div>
        )}

        {/* Slide 3: Highlight Moments & Final Share */}
        {currentSlide === 3 && (
          <div className="flex-1 flex flex-col justify-between p-7 pt-20 bg-gradient-to-b from-orange-950 via-stone-900 to-black animate-in fade-in">
            <div className="space-y-2 pt-2">
              <span className="text-xs uppercase font-mono tracking-widest text-amber-300">
                Momentos para Lembrar
              </span>
              <h3 className="text-2xl font-serif font-bold text-white">
                Trechos da sua História
              </h3>
            </div>

            {/* Highlight records preview */}
            <div className="space-y-2.5 my-auto max-h-56 overflow-y-auto no-scrollbar">
              {retrospective.highlightRecords.length > 0 ? (
                retrospective.highlightRecords.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      if (onOpenRecord) {
                        onClose();
                        onOpenRecord(r);
                      }
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors cursor-pointer text-left space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-stone-400">
                      <span className="font-semibold text-orange-300">{r.title || 'Momento'}</span>
                      <span>{new Date(r.date || r.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {r.content && (
                      <p className="text-xs text-stone-300 line-clamp-2 italic">
                        "{r.content}"
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 bg-white/5 rounded-xl text-center text-xs text-stone-400">
                  Nenhum momento registrado com destaque especial neste mês.
                </div>
              )}
            </div>

            {/* Share / Copy Button */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleShareSummary}
                className="w-full py-3 bg-white hover:bg-stone-100 text-stone-900 rounded-2xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedShare ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Copiado para a área de transferência!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-stone-700" />
                    <span>Copiar resumo da minha retrospectiva</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation Chevrons */}
        <div className="px-6 py-3.5 bg-black/50 border-t border-white/10 flex items-center justify-between z-20">
          <button
            onClick={handlePrev}
            disabled={currentSlide === 0}
            className="p-2 rounded-full text-stone-400 hover:text-white disabled:opacity-20 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-xs font-mono text-stone-400">
            {currentSlide + 1} / {totalSlides}
          </span>

          <button
            onClick={handleNext}
            disabled={currentSlide === totalSlides - 1}
            className="p-2 rounded-full text-stone-400 hover:text-white disabled:opacity-20 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
