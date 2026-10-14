import React, { useState, useMemo } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  Clock,
  Sparkles,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface CalendarLifeViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
  onNewRecord: (type?: any) => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
  onEditPhoto?: (record: DiaryRecord, photoUrl: string) => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const CalendarLifeView: React.FC<CalendarLifeViewProps> = ({
  user,
  records,
  onSelectRecord,
  onNewRecord,
  onOpenPdf,
  onEditPhoto,
}) => {
  const activeRecords = useMemo(() => records.filter((r) => !r.isDeleted), [records]);
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  // Group records of this month by day
  const recordsByDay = useMemo(() => {
    const map: Record<number, DiaryRecord[]> = {};

    activeRecords.forEach((r) => {
      const d = new Date(r.date || r.createdAt);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(r);
      }
    });

    return map;
  }, [activeRecords, currentYear, currentMonth]);

  // Days in month calculation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  // Selected Day records
  const dayRecords = selectedDay ? recordsByDay[selectedDay] || [] : [];
  const monthTotalRecords = (Object.values(recordsByDay) as DiaryRecord[][]).reduce((acc, list) => acc + list.length, 0);
  const activeDaysCount = Object.keys(recordsByDay).length;

  return (
    <div className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-5">
      {/* 1. Header with Stats without guilt */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-800 leading-none">
                Calendário da Vida
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                A história dos seus dias e momentos guardados
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200/60">
              {activeDaysCount} {activeDaysCount === 1 ? 'dia guardado' : 'dias guardados'}
            </span>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center justify-between pt-1 border-t border-stone-100">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <h3 className="text-sm font-bold text-stone-800 capitalize">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h3>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center pt-1">
          {WEEK_DAYS.map((wd) => (
            <span key={wd} className="text-[11px] font-semibold text-stone-400">
              {wd}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <div key={`empty_${idx}`} className="h-10 rounded-xl" />
          ))}

          {/* Month days */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const hasRecords = !!recordsByDay[day] && recordsByDay[day].length > 0;
            const isSelected = selectedDay === day;
            const isToday =
              now.getFullYear() === currentYear &&
              now.getMonth() === currentMonth &&
              now.getDate() === day;

            const dayRecs = recordsByDay[day] || [];
            const hasPhoto = dayRecs.some((r) => r.type === 'photo');
            const hasAudio = dayRecs.some((r) => r.type === 'audio');

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`h-11 rounded-2xl flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-600 text-white font-bold shadow-xs scale-105'
                    : isToday
                    ? 'bg-orange-50 border border-orange-300 text-orange-950 font-bold'
                    : hasRecords
                    ? 'bg-stone-50 hover:bg-orange-50/70 border border-stone-200/80 text-stone-800 font-semibold'
                    : 'hover:bg-stone-50 text-stone-600'
                }`}
              >
                <span className="text-xs leading-none">{day}</span>

                {/* Subtle indicators under day */}
                {hasRecords && (
                  <div className="flex items-center gap-0.5 mt-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected
                          ? 'bg-white'
                          : hasPhoto
                          ? 'bg-sky-500'
                          : hasAudio
                          ? 'bg-emerald-500'
                          : 'bg-orange-500'
                      }`}
                    />
                    {dayRecs.length > 1 && (
                      <span
                        className={`w-1 h-1 rounded-full ${
                          isSelected ? 'bg-white/80' : 'bg-stone-400'
                        }`}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Selected Day Detail Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-800">
            {selectedDay
              ? `${selectedDay} de ${MONTH_NAMES[currentMonth]} de ${currentYear}`
              : 'Selecione um dia no calendário'}
          </h3>

          {selectedDay && (
            <button
              onClick={() => onNewRecord()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-full transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Registrar neste dia</span>
            </button>
          )}
        </div>

        {selectedDay && dayRecords.length === 0 ? (
          <div className="bg-white border border-stone-200/80 rounded-2xl p-6 text-center space-y-2">
            <p className="text-xs text-stone-500">
              Nenhum registro guardado neste dia específico.
            </p>
            <p className="text-[11px] text-stone-400 italic">
              Dias vazios são parte natural da vida — o diário valoriza o que você decide guardar.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayRecords.map((rec) => {
              const photoAtt = rec.attachments?.find((a) => a.type === 'image');
              return (
                <div
                  key={rec.id}
                  onClick={() => onSelectRecord(rec)}
                  className="bg-white hover:bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-all cursor-pointer shadow-2xs group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {photoAtt && (
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200/60">
                        <img
                          src={photoAtt.url}
                          alt={rec.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-stone-900 group-hover:text-orange-700 transition-colors truncate">
                        {rec.title || 'Registro'}
                      </h4>
                      {rec.content && (
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">
                          {rec.content}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-stone-400 shrink-0">
                    {rec.time || 'Salvo'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
