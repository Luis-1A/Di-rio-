/**
 * Memory Recall Engine ("Lembrança de Hoje")
 * Reencontra momentos do passado para despertar a curiosidade pessoal.
 */
import { DiaryRecord } from '../types';

export interface DailyMemoryRecall {
  record: DiaryRecord;
  reason: string;
  timeAgoText: string;
  isExactAnniversary: boolean;
}

export function findDailyMemory(records: DiaryRecord[]): DailyMemoryRecall | null {
  const active = records.filter((r) => !r.isDeleted);
  if (active.length === 0) return null;

  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate(); // 1-31
  const currentYear = today.getFullYear();

  // 1. Check for exact day and month in previous years (e.g. 1 year ago, 2 years ago)
  const anniversaryMatch = active.find((r) => {
    const d = new Date(r.date || r.createdAt);
    return (
      d.getMonth() === currentMonth &&
      d.getDate() === currentDay &&
      d.getFullYear() < currentYear
    );
  });

  if (anniversaryMatch) {
    const d = new Date(anniversaryMatch.date || anniversaryMatch.createdAt);
    const yearsDiff = currentYear - d.getFullYear();
    const timeAgoText = yearsDiff === 1 ? 'Há exatamente 1 ano' : `Há ${yearsDiff} anos`;
    return {
      record: anniversaryMatch,
      reason: 'Neste mesmo dia em sua história',
      timeAgoText,
      isExactAnniversary: true,
    };
  }

  // 2. Check for same day in previous months of current or previous year
  const sameDayPastMonth = active.find((r) => {
    const d = new Date(r.date || r.createdAt);
    const isPast = d.getTime() < today.getTime() - 20 * 24 * 60 * 60 * 1000;
    return d.getDate() === currentDay && isPast;
  });

  if (sameDayPastMonth) {
    const d = new Date(sameDayPastMonth.date || sameDayPastMonth.createdAt);
    const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    const monthsDiff = Math.max(1, Math.round(diffDays / 30));
    return {
      record: sameDayPastMonth,
      reason: 'No mesmo dia em outro momento',
      timeAgoText: monthsDiff === 1 ? 'Há cerca de 1 mês' : `Há cerca de ${monthsDiff} meses`,
      isExactAnniversary: false,
    };
  }

  // 3. Fallback: Find a memorable past record (older than 7 days, prioritizing photos or favorites)
  const olderRecords = active.filter((r) => {
    const d = new Date(r.date || r.createdAt);
    const diffDays = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 3;
  });

  if (olderRecords.length > 0) {
    // Prefer favorite or photo
    const preferred =
      olderRecords.find((r) => r.isFavorite && (r.type === 'photo' || r.type === 'audio')) ||
      olderRecords.find((r) => r.type === 'photo') ||
      olderRecords.find((r) => r.type === 'audio') ||
      olderRecords[olderRecords.length - 1]; // Oldest

    if (preferred) {
      const d = new Date(preferred.date || preferred.createdAt);
      const diffDays = Math.max(1, Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
      let timeAgoText = `Há ${diffDays} dias`;
      if (diffDays >= 30) {
        const months = Math.round(diffDays / 30);
        timeAgoText = months === 1 ? 'Há 1 mês' : `Há ${months} meses`;
      }
      return {
        record: preferred,
        reason: 'Uma lembrança para você revisitar',
        timeAgoText,
        isExactAnniversary: false,
      };
    }
  }

  // If all records are very recent (e.g. today/yesterday), return the first created
  const first = active[active.length - 1];
  return {
    record: first,
    reason: 'Sua primeira memória registrada',
    timeAgoText: 'Revisite este momento',
    isExactAnniversary: false,
  };
}
