import React, { useState } from 'react';
import { DiaryRecord, Milestone, TimeCapsule, UserProfile } from '../types';
import {
  calculateUserGamification,
  DEFAULT_COLLECTIONS,
} from '../lib/milestoneEngine';
import { logoutUser } from '../lib/authService';
import { exportCompleteUserData } from '../lib/firestoreService';
import {
  User,
  Award,
  Sparkles,
  Star,
  FolderHeart,
  Plane,
  Heart,
  Lightbulb,
  Leaf,
  Download,
  Film,
  LogOut,
  Sliders,
  CheckCircle2,
  ChevronRight,
  Shield,
  Clock,
  Plus,
} from 'lucide-react';

interface ProfileViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  capsules: TimeCapsule[];
  milestones: Milestone[];
  onShowIntro: () => void;
  onOpenDiagnostics: () => void;
  onSelectCollection?: (colName: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  records,
  capsules,
  milestones,
  onShowIntro,
  onOpenDiagnostics,
  onSelectCollection,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const gamification = calculateUserGamification(records, capsules);
  const [isExporting, setIsExporting] = useState(false);

  const stats = {
    total: activeRecords.length,
    photos: activeRecords.filter((r) => r.type === 'photo').length,
    audios: activeRecords.filter((r) => r.type === 'audio').length,
    videos: activeRecords.filter((r) => r.type === 'video').length,
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportCompleteUserData(user.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diario_100_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const getCollectionIcon = (iconName: string) => {
    switch (iconName) {
      case 'plane':
        return <Plane className="w-4 h-4" />;
      case 'heart':
        return <Heart className="w-4 h-4" />;
      case 'lightbulb':
        return <Lightbulb className="w-4 h-4" />;
      case 'leaf':
        return <Leaf className="w-4 h-4" />;
      default:
        return <FolderHeart className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-5 text-stone-800">
      {/* 1. Profile Header Card */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#080D1B] to-[#1A2238] text-white flex items-center justify-center text-xl font-bold font-serif shadow-md border-2 border-white">
            {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : '100%'}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-stone-900 truncate">
              {user.displayName || 'Meu Diário'}
            </h2>
            <p className="text-xs text-stone-500 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold text-[#080D1B] bg-stone-100 px-2.5 py-0.5 rounded-full w-fit">
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>Espaço Privado & Seguro</span>
            </div>
          </div>
        </div>

        {/* 2. Gamification Level Card (Nível 3 / XP) */}
        <div className="bg-gradient-to-br from-[#080D1B] to-[#1A2238] rounded-2xl p-5 text-white space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-[#C9A4DC]">
                <Star className="w-4 h-4 fill-current" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-none">
                  Nível {gamification.level}
                </h3>
                <span className="text-[11px] text-[#C9A4DC] font-medium">
                  {gamification.levelTitle}
                </span>
              </div>
            </div>

            <span className="text-xs font-mono text-stone-300">
              {gamification.xp} / {gamification.nextLevelXp} XP
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#C9A4DC] to-white rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  100,
                  (gamification.xp / gamification.nextLevelXp) * 100
                )}%`,
              }}
            />
          </div>

          <p className="text-[11px] text-stone-400">
            Você ganha XP por registrar momentos, refletir e organizar suas lembranças. Sem metas forçadas nem perda de progresso por ausência.
          </p>
        </div>
      </div>

      {/* 3. Conquistas Pessoais */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-bold text-stone-900 leading-none">
              Conquistas pessoais
            </h3>
          </div>
          <span className="text-xs font-semibold text-stone-500 font-mono">
            {milestones.filter((m) => m.unlocked).length} / {milestones.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {milestones.slice(0, 4).map((m) => (
            <div
              key={m.id}
              className={`p-3 rounded-2xl border transition-all flex items-start gap-2.5 ${
                m.unlocked
                  ? 'bg-amber-50/50 border-orange-200'
                  : 'bg-stone-50 border-stone-200/60 opacity-60'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                  m.unlocked ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-400'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-stone-900 truncate">
                  {m.title}
                </h4>
                <span className="text-[10px] text-stone-500 block truncate">
                  {m.unlocked ? 'Concluída' : 'Disponível'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Coleções Pessoais (Viagens, Amizades, Ideias, Fases da vida) */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderHeart className="w-4 h-4 text-[#080D1B]" />
            <h3 className="text-sm font-bold text-stone-900 leading-none">
              Coleções pessoais
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DEFAULT_COLLECTIONS.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => onSelectCollection?.(col.id)}
              className="p-3 rounded-2xl bg-stone-50 hover:bg-orange-50/70 border border-stone-200/70 hover:border-orange-200 transition-all flex flex-col items-center justify-center text-center group cursor-pointer"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-1 text-white shadow-2xs group-hover:scale-105 transition-transform"
                style={{ backgroundColor: col.color || '#C9A4DC' }}
              >
                {getCollectionIcon(col.icon)}
              </div>
              <span className="text-xs font-bold text-stone-800 group-hover:text-orange-700">
                {col.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Ações & Configurações do Sistema */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-4 shadow-xs divide-y divide-stone-100">
        <button
          type="button"
          onClick={onShowIntro}
          className="w-full py-3 px-2 flex items-center justify-between text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Film className="w-4 h-4 text-purple-600" />
            <span>Ver apresentação cinematográfica</span>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </button>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="w-full py-3 px-2 flex items-center justify-between text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-emerald-600" />
            <span>{isExporting ? 'Exportando...' : 'Exportar dados completos (Backup JSON)'}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </button>

        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="w-full py-3 px-2 flex items-center justify-between text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-stone-600" />
            <span>Diagnósticos do Sistema & Nuvem</span>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </button>

        <button
          type="button"
          onClick={() => logoutUser()}
          className="w-full py-3 px-2 flex items-center justify-between text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
