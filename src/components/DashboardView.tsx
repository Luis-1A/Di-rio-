import React, { useState, useMemo } from 'react';
import { DiaryRecord, MemoryItem, TimeCapsule, UserProfile } from '../types';
import { MediaFeedRenderer } from './MediaFeedRenderer';
import { OnThisDayCard } from './OnThisDayCard';
import { findDailyMemory } from '../lib/memoryRecall';
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  File,
  ArrowRight,
  Clock,
  Sparkles,
  FolderClosed,
  CheckCircle2,
  Calendar,
  Hourglass,
  Award,
  BookOpen,
  ChevronRight,
  Heart,
  Quote,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  capsules: TimeCapsule[];
  onNewRecord: (type?: 'text' | 'photo' | 'audio' | 'video' | 'document', prompt?: string) => void;
  onSelectRecord: (record: DiaryRecord) => void;
  onViewAllRecords: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
  onEditPhoto?: (record: DiaryRecord, photoUrl: string) => void;
  onOpenTimeCapsules: () => void;
  onOpenRetrospective: () => void;
  onOpenMilestones: () => void;
  onOpenCalendar: () => void;
  onRecordUpdated?: (record: DiaryRecord) => void;
}

const INSPIRATIONAL_PROMPTS = [
  'O que aconteceu hoje que você gostaria de lembrar daqui a 5 anos?',
  'Qual foi o momento mais tranquilo ou reconfortante do seu dia?',
  'Quem esteve presente na sua vida hoje e te fez bem?',
  'Uma conversa, ideia ou detalhe simples que chamou sua atenção...',
  'Qual sentimento ou sensação melhor resume o seu dia até aqui?',
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  records,
  capsules,
  onNewRecord,
  onSelectRecord,
  onViewAllRecords,
  onOpenPdf,
  onEditPhoto,
  onOpenTimeCapsules,
  onOpenRetrospective,
  onOpenMilestones,
  onOpenCalendar,
  onRecordUpdated,
}) => {
  const activeRecords = useMemo(() => records.filter((r) => !r.isDeleted), [records]);
  const recentRecords = useMemo(() => activeRecords.slice(0, 8), [activeRecords]);
  const lastRecord = activeRecords[0] || null;

  // Find daily memory recall
  const dailyRecall = useMemo(() => findDailyMemory(records), [records]);

  // Current month stats
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const currentMonthRecords = useMemo(() => {
    return activeRecords.filter((r) => {
      const d = new Date(r.date || r.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [activeRecords, currentMonth, currentYear]);

  const activeDaysThisMonth = useMemo(() => {
    const days = new Set(
      currentMonthRecords.map((r) => {
        const d = new Date(r.date || r.createdAt);
        return d.getDate();
      })
    );
    return days.size;
  }, [currentMonthRecords]);

  const monthPhotos = currentMonthRecords.filter((r) => r.type === 'photo').length;
  const monthAudios = currentMonthRecords.filter((r) => r.type === 'audio').length;

  // Time capsules status
  const pendingCapsulesCount = capsules.filter((c) => !c.isOpened).length;
  const readyCapsulesCount = capsules.filter((c) => {
    if (c.isOpened) return false;
    const today = new Date().toISOString().split('T')[0];
    return c.unlockDate <= today;
  }).length;

  const getRecordBadge = (type: string) => {
    switch (type) {
      case 'photo':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
            <ImageIcon className="w-3 h-3 text-sky-600" />
            <span>Foto</span>
          </span>
        );
      case 'audio':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
            <Mic className="w-3 h-3 text-emerald-600" />
            <span>Áudio</span>
          </span>
        );
      case 'video':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60">
            <Video className="w-3 h-3 text-purple-600" />
            <span>Vídeo</span>
          </span>
        );
      case 'document':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            <File className="w-3 h-3 text-amber-600" />
            <span>PDF / Arquivo</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200/60">
            <FileText className="w-3 h-3 text-stone-500" />
            <span>Texto</span>
          </span>
        );
    }
  };

  const formatFeedTime = (dateStr: string, createdAt: string) => {
    try {
      const d = new Date(createdAt || dateStr);
      const isToday =
        now.getFullYear() === d.getFullYear() &&
        now.getMonth() === d.getMonth() &&
        now.getDate() === d.getDate();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        yesterday.getFullYear() === d.getFullYear() &&
        yesterday.getMonth() === d.getMonth() &&
        yesterday.getDate() === d.getDate();

      const timeStr = d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isToday) return `Hoje, ${timeStr}`;
      if (isYesterday) return `Ontem, ${timeStr}`;

      return (
        d.toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'short',
        }) + `, ${timeStr}`
      );
    } catch {
      return dateStr || '';
    }
  };

  return (
    <div id="dashboard-feed" className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-6">
      {/* 1. Warm Greeting & Philosophy */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider font-mono">
              Seu Espaço Pessoal
            </span>
            <h1 className="text-xl font-serif font-bold text-stone-900 mt-0.5">
              Reencontre sua história
            </h1>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">
              O diário onde cada lembrança, fotografia e áudio ganham um lugar de valor no seu caminho.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-medium border border-emerald-200/80 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Nuvem Ativa</span>
          </div>
        </div>

        {/* Feature Navigation Pills (Retrospectiva, Cápsula, Marcos, Calendário) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-stone-100">
          <button
            type="button"
            onClick={onOpenRetrospective}
            className="flex items-center gap-2 p-2.5 rounded-2xl bg-stone-50 hover:bg-orange-50/70 border border-stone-200/70 hover:border-orange-200 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-stone-800 group-hover:text-orange-700 truncate">
                Retrospectiva
              </div>
              <div className="text-[10px] text-stone-400 truncate">Do Mês</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenTimeCapsules}
            className="flex items-center gap-2 p-2.5 rounded-2xl bg-stone-50 hover:bg-amber-50/70 border border-stone-200/70 hover:border-amber-200 transition-all cursor-pointer text-left group relative"
          >
            <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Hourglass className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-stone-800 group-hover:text-amber-800 truncate">
                Cápsula
              </div>
              <div className="text-[10px] text-stone-400 truncate">
                {readyCapsulesCount > 0 ? '✨ Pronta!' : `${pendingCapsulesCount} selada(s)`}
              </div>
            </div>
            {readyCapsulesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-2 right-2 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenCalendar}
            className="flex items-center gap-2 p-2.5 rounded-2xl bg-stone-50 hover:bg-purple-50/70 border border-stone-200/70 hover:border-purple-200 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-stone-800 group-hover:text-purple-700 truncate">
                Calendário
              </div>
              <div className="text-[10px] text-stone-400 truncate">Da Vida</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenMilestones}
            className="flex items-center gap-2 p-2.5 rounded-2xl bg-stone-50 hover:bg-teal-50/70 border border-stone-200/70 hover:border-teal-200 transition-all cursor-pointer text-left group"
          >
            <div className="w-7 h-7 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-stone-800 group-hover:text-teal-700 truncate">
                Marcos
              </div>
              <div className="text-[10px] text-stone-400 truncate">História</div>
            </div>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-5 gap-2 pt-1 border-t border-stone-100">
          <button
            onClick={() => onNewRecord('text')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-orange-50 border border-stone-200/70 hover:border-orange-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-orange-600 shadow-2xs mb-1">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-orange-700">
              Texto
            </span>
          </button>

          <button
            onClick={() => onNewRecord('photo')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-sky-50 border border-stone-200/70 hover:border-sky-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-sky-600 shadow-2xs mb-1">
              <ImageIcon className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-sky-700">
              Foto
            </span>
          </button>

          <button
            onClick={() => onNewRecord('audio')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-emerald-50 border border-stone-200/70 hover:border-emerald-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-emerald-600 shadow-2xs mb-1">
              <Mic className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-emerald-700">
              Áudio
            </span>
          </button>

          <button
            onClick={() => onNewRecord('video')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-purple-50 border border-stone-200/70 hover:border-purple-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-purple-600 shadow-2xs mb-1">
              <Video className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-purple-700">
              Vídeo
            </span>
          </button>

          <button
            onClick={() => onNewRecord('document')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-50 hover:bg-amber-50 border border-stone-200/70 hover:border-amber-200 transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-stone-600 group-hover:text-amber-600 shadow-2xs mb-1">
              <File className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700 group-hover:text-amber-700">
              PDF
            </span>
          </button>
        </div>
      </div>

      {/* 2. "Lembrança de Hoje" Card (Curiosity Engine) */}
      {dailyRecall && (
        <OnThisDayCard
          user={user}
          recall={dailyRecall}
          onOpenRecord={onSelectRecord}
          onRecordUpdated={onRecordUpdated}
        />
      )}

      {/* 3. "Seu Diário Neste Mês" (Evolução Sem Punição) */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 leading-none">
                Seu diário neste mês
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {currentMonthRecords.length} memórias guardadas em {activeDaysThisMonth} dias
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenRetrospective}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
          >
            <span>Ver resumo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
          <div className="bg-stone-50 rounded-2xl p-3 border border-stone-100">
            <span className="block text-lg font-bold font-mono text-stone-900">
              {currentMonthRecords.length}
            </span>
            <span className="text-[11px] text-stone-500">Momentos</span>
          </div>

          <div className="bg-stone-50 rounded-2xl p-3 border border-stone-100">
            <span className="block text-lg font-bold font-mono text-sky-700">
              {monthPhotos}
            </span>
            <span className="text-[11px] text-stone-500">Fotografias</span>
          </div>

          <div className="bg-stone-50 rounded-2xl p-3 border border-stone-100">
            <span className="block text-lg font-bold font-mono text-emerald-700">
              {monthAudios}
            </span>
            <span className="text-[11px] text-stone-500">Áudios de voz</span>
          </div>
        </div>
      </div>

      {/* 4. "Convite para Escrever" (Gentle Inspiration Prompts) */}
      <div className="bg-gradient-to-r from-orange-50/60 to-amber-50/40 border border-orange-200/80 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Quote className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-bold text-stone-900 leading-none">
            Convite para escrever
          </h3>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          Toque em uma reflexão para iniciar seu registro de hoje com calma e inspiração:
        </p>

        <div className="space-y-2 pt-1">
          {INSPIRATIONAL_PROMPTS.slice(0, 3).map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onNewRecord('text', prompt)}
              className="w-full text-left p-3 rounded-2xl bg-white hover:bg-orange-100/60 border border-stone-200/70 hover:border-orange-300 text-xs text-stone-800 transition-all flex items-center justify-between gap-3 shadow-2xs group cursor-pointer"
            >
              <span className="line-clamp-2 leading-relaxed font-serif">"{prompt}"</span>
              <Plus className="w-4 h-4 text-orange-600 shrink-0 group-hover:scale-110 transition-transform" />
            </button>
          ))}
        </div>
      </div>

      {/* 5. "Continue de onde parou" (Last Entry Shortcut) */}
      {lastRecord && (
        <div className="bg-white border border-stone-200/80 rounded-3xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span className="font-semibold text-stone-700">Continue de onde parou</span>
            <span>{formatFeedTime(lastRecord.date, lastRecord.createdAt)}</span>
          </div>

          <div
            onClick={() => onSelectRecord(lastRecord)}
            className="p-3 bg-stone-50 hover:bg-stone-100/70 rounded-2xl border border-stone-200/60 transition-colors cursor-pointer group flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-stone-900 group-hover:text-orange-700 transition-colors truncate">
                {lastRecord.title || 'Último registro'}
              </h4>
              {lastRecord.content && (
                <p className="text-[11px] text-stone-500 truncate mt-0.5">
                  {lastRecord.content}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 shrink-0">
              <span>Abrir</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}

      {/* 6. Mural / Linha do Tempo Visual Recente */}
      <div className="space-y-3.5 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-800 tracking-tight">
            Mural da sua história ({activeRecords.length})
          </h3>

          <button
            onClick={() => onNewRecord()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50/80 hover:bg-orange-100/80 px-3 py-1 rounded-full transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Novo momento</span>
          </button>
        </div>

        {recentRecords.length === 0 ? (
          <div className="bg-white border border-stone-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
              <FolderClosed className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-stone-800">
                Seu diário está pronto para ser vivido
              </h4>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Guarde textos, fotografias, relatos em áudio, vídeos e lembranças pessoais.
              </p>
            </div>
            <button
              onClick={() => onNewRecord()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Criar primeiro momento</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {recentRecords.map((record) => {
              return (
                <div
                  key={record.id}
                  onClick={() => onSelectRecord(record)}
                  className="bg-white hover:bg-stone-50/60 border border-stone-200/80 rounded-3xl p-4 transition-all duration-150 cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.02)] group space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {getRecordBadge(record.type)}
                      {record.reflections && record.reflections.length > 0 && (
                        <span className="text-[10px] font-medium text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                          Antes e Agora
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-400 font-normal">
                      {formatFeedTime(record.date, record.createdAt)}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-stone-800 leading-snug group-hover:text-orange-700 transition-colors">
                    {record.title || (record.type === 'text' ? 'Anotação' : 'Registro')}
                  </h4>

                  {record.content && (
                    <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                      {record.content}
                    </p>
                  )}

                  {/* Media Presentation */}
                  <MediaFeedRenderer
                    record={record}
                    onOpenPdf={onOpenPdf}
                    onEditPhoto={onEditPhoto}
                    mode="feed"
                  />
                </div>
              );
            })}

            {activeRecords.length > 8 && (
              <div className="pt-2 text-center">
                <button
                  onClick={onViewAllRecords}
                  className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-semibold px-4 py-2 rounded-full hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  <span>Ver todos os {activeRecords.length} registros no Arquivo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
