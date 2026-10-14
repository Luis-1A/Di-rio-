import React from 'react';
import { Milestone } from '../types';
import {
  Award,
  X,
  Sparkles,
  Mic,
  Camera,
  GitCompare,
  Hourglass,
  BookOpen,
  Compass,
  Crown,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface MilestonesModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestones: Milestone[];
}

export const MilestonesModal: React.FC<MilestonesModalProps> = ({
  isOpen,
  onClose,
  milestones,
}) => {
  if (!isOpen) return null;

  const unlockedCount = milestones.filter((m) => m.unlocked).length;

  const getMilestoneIcon = (iconName: string) => {
    switch (iconName) {
      case 'sparkles':
        return <Sparkles className="w-5 h-5 text-amber-600" />;
      case 'mic':
        return <Mic className="w-5 h-5 text-emerald-600" />;
      case 'camera':
        return <Camera className="w-5 h-5 text-sky-600" />;
      case 'git-compare':
        return <GitCompare className="w-5 h-5 text-orange-600" />;
      case 'hourglass':
        return <Hourglass className="w-5 h-5 text-indigo-600" />;
      case 'book-open':
        return <BookOpen className="w-5 h-5 text-purple-600" />;
      case 'compass':
        return <Compass className="w-5 h-5 text-teal-600" />;
      case 'crown':
        return <Crown className="w-5 h-5 text-yellow-600" />;
      default:
        return <Award className="w-5 h-5 text-orange-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#FAF8F5] border border-stone-200/90 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-stone-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Marcos da Minha História
              </h2>
              <p className="text-xs text-stone-500">
                {unlockedCount} de {milestones.length} marcos alcançados
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Motivational Philosophy Banner */}
        <div className="bg-orange-50/70 border-b border-orange-100 px-6 py-3 text-xs text-stone-700 leading-relaxed">
          <p>
            🌱 <strong>Sem punição nem metas forçadas:</strong> Este diário celebra cada momento que você escolhe guardar. Ausências temporárias nunca apagam sua história.
          </p>
        </div>

        {/* Milestones List */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
          {milestones.map((m) => (
            <div
              key={m.id}
              className={`p-4 rounded-2xl border transition-all ${
                m.unlocked
                  ? 'bg-white border-stone-200 shadow-xs'
                  : 'bg-stone-100/50 border-stone-200/60 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    m.unlocked ? 'bg-orange-50 border border-orange-200/70 shadow-2xs' : 'bg-stone-200 text-stone-400'
                  }`}
                >
                  {m.unlocked ? getMilestoneIcon(m.icon) : <Lock className="w-5 h-5 text-stone-400" />}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-stone-900">
                      {m.title}
                    </h4>
                    {m.unlocked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Conquistado</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-stone-400">
                        {m.progress ? `${m.progress.current} / ${m.progress.total}` : 'Em progresso'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed">
                    {m.description}
                  </p>

                  {/* Progress bar if not completed */}
                  {!m.unlocked && m.progress && (
                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-orange-500 rounded-full transition-all"
                        style={{
                          width: `${(m.progress.current / m.progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
