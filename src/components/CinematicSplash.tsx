import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Heart, BookOpen, Star, X } from 'lucide-react';

interface CinematicSplashProps {
  onStart: () => void;
  canDismiss?: boolean;
}

export const CinematicSplash: React.FC<CinematicSplashProps> = ({
  onStart,
  canDismiss = false,
}) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 300); // Sky & City
    const t2 = setTimeout(() => setStep(2), 800); // Title & Subtitle
    const t3 = setTimeout(() => setStep(3), 1400); // Description & Button

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#080D1B] text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Optional Close Button if opened from settings */}
      {canDismiss && (
        <button
          onClick={onStart}
          className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Atmospheric Starry Sky & Soft Floating Clouds */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Subtle Stars */}
        <div className="absolute top-10 left-[15%] w-1 h-1 bg-white/70 rounded-full animate-ping" />
        <div className="absolute top-24 left-[75%] w-1.5 h-1.5 bg-purple-200/80 rounded-full animate-pulse" />
        <div className="absolute top-40 left-[35%] w-1 h-1 bg-amber-100/90 rounded-full" />
        <div className="absolute top-64 right-[20%] w-1 h-1 bg-white/60 rounded-full" />
        <div className="absolute top-16 left-[50%] w-1.5 h-1.5 bg-white/80 rounded-full animate-pulse" />

        {/* Soft Violet/Pink Aurora Gradients */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-[#C9A4DC]/20 via-[#E88C7D]/15 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute bottom-40 -left-20 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center space-y-6 pt-10">
        {/* Cinematic Illustration of Cat on Cityscape Rooftop at Twilight */}
        <div
          className={`w-64 h-64 md:w-72 md:h-72 rounded-3xl overflow-hidden relative shadow-[0_12px_40px_rgba(0,0,0,0.6)] border border-white/10 transition-all duration-1000 ${
            step >= 1 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
          }`}
        >
          {/* Sunset Sky Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#1C1635] via-[#4A2643] via-50% via-[#A84B42] to-[#E5804B]" />

          {/* Crescent Moon & Stars */}
          <div className="absolute top-6 left-7 w-6 h-6 rounded-full border-t-2 border-l-2 border-amber-100/90 rotate-45" />

          {/* Distant City Skyline Silhouettes with Glowing Window Lights */}
          <div className="absolute bottom-10 inset-x-0 h-28 flex items-end justify-center gap-1.5 opacity-60">
            <div className="w-6 h-20 bg-[#160E24] rounded-t-xs" />
            <div className="w-8 h-26 bg-[#120B1E] rounded-t-xs" />
            <div className="w-5 h-16 bg-[#160E24] rounded-t-xs" />
            <div className="w-10 h-24 bg-[#0F0819] rounded-t-xs" />
            <div className="w-7 h-18 bg-[#160E24] rounded-t-xs" />
            <div className="w-9 h-22 bg-[#120B1E] rounded-t-xs" />
            <div className="w-6 h-14 bg-[#160E24] rounded-t-xs" />
          </div>

          {/* Foreground Roof with Cat Silhouette looking at the horizon */}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-[#080D1B] flex items-center justify-center">
            {/* Cat Silhouette */}
            <div className="relative -top-4 flex flex-col items-center">
              {/* Ears */}
              <div className="flex gap-2">
                <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-[#080D1B]" />
                <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-[#080D1B]" />
              </div>
              {/* Head */}
              <div className="w-5 h-4 bg-[#080D1B] rounded-full -mt-0.5" />
              {/* Body */}
              <div className="w-7 h-9 bg-[#080D1B] rounded-t-full -mt-0.5" />
              {/* Tail curving gently */}
              <div className="absolute -right-2.5 bottom-1 w-3 h-5 border-r-2 border-b-2 border-[#080D1B] rounded-br-full" />
            </div>
          </div>
        </div>

        {/* Titles & Brand */}
        <div
          className={`space-y-2 transition-all duration-700 ${
            step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-[#C9A4DC] border border-white/10 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-[#C9A4DC]" />
            <span>Espaço Pessoal & Seguro</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-serif font-bold text-white tracking-tight">
            Diário 100%
          </h1>

          <p className="text-base text-[#F4E4E1] font-serif italic">
            “Sua vida, do seu jeito.”
          </p>

          <p className="text-xs text-stone-300 max-w-sm mx-auto leading-relaxed pt-1">
            Um espaço pessoal para você registrar, guardar e revisitar tudo o que importa. Aqui, cada momento vira uma lembrança, e cada lembrança conta uma parte da sua história.
          </p>
        </div>

        {/* Action Button */}
        <div
          className={`w-full max-w-xs pt-4 transition-all duration-700 ${
            step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <button
            onClick={onStart}
            className="w-full py-3.5 px-6 rounded-full bg-white hover:bg-[#F4E4E1] text-[#080D1B] font-bold text-sm transition-all shadow-[0_4px_24px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Começar</span>
            <ArrowRight className="w-4 h-4 text-[#080D1B]" />
          </button>

          <p className="text-[11px] text-stone-400 mt-3 font-serif italic">
            Não é só um diário. É a sua vida, organizada em um só lugar. ♡
          </p>
        </div>
      </div>

      {/* Bottom Subtle Indicator */}
      <div className="py-4 text-center text-[10px] text-stone-500 font-mono">
        Diário 100% • Sincronizado & Criptografado
      </div>
    </div>
  );
};
