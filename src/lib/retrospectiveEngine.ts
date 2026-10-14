/**
 * Retrospective Engine ("Retrospectiva do Mês")
 * Compila estatísticas e sínteses visuais como um Spotify Wrapped pessoal.
 */
import { DiaryRecord, MonthlyRetrospective } from '../types';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function generateMonthlyRetrospective(
  records: DiaryRecord[],
  targetYear?: number,
  targetMonth?: number // 0-11
): MonthlyRetrospective {
  const active = records.filter((r) => !r.isDeleted);
  const now = new Date();
  const year = targetYear !== undefined ? targetYear : now.getFullYear();
  const month = targetMonth !== undefined ? targetMonth : now.getMonth();

  const monthRecords = active.filter((r) => {
    const d = new Date(r.date || r.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const photosCount = monthRecords.filter((r) => r.type === 'photo').length;
  const audiosCount = monthRecords.filter((r) => r.type === 'audio').length;
  const videosCount = monthRecords.filter((r) => r.type === 'video').length;
  const docsCount = monthRecords.filter((r) => r.type === 'document').length;

  const daysSet = new Set(
    monthRecords.map((r) => {
      const d = new Date(r.date || r.createdAt);
      return d.getDate();
    })
  );

  // Tag frequency
  const tagCounts: Record<string, number> = {};
  monthRecords.forEach((r) => {
    (r.tags || []).forEach((t) => {
      const clean = t.trim().toLowerCase();
      if (clean) tagCounts[clean] = (tagCounts[clean] || 0) + 1;
    });
  });

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Category frequency
  const catCounts: Record<string, number> = {};
  monthRecords.forEach((r) => {
    const cat = (r.category || 'geral').toLowerCase();
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'vida cotidiana';

  const highlightRecords = monthRecords
    .filter((r) => r.isFavorite || r.type === 'photo' || r.type === 'audio' || (r.content && r.content.length > 50))
    .slice(0, 4);

  // Poetic synthesis
  let poeticSummary = '';
  if (monthRecords.length === 0) {
    poeticSummary = `Um mês de silêncio e presença. Cada recomeço é uma página em branco pronta para ser vivida.`;
  } else if (photosCount > 0 && audiosCount > 0) {
    poeticSummary = `Um mês expressivo e multimodal: você guardou imagens que contam histórias e preservou sua própria voz no tempo.`;
  } else if (photosCount > 0) {
    poeticSummary = `Um mês de olhares atentos: a fotografia foi o seu principal instrumento para eternizar o que importava.`;
  } else if (audiosCount > 0) {
    poeticSummary = `Um mês de desabafos e relatos sinceros: sua voz capturou nuances e emoções autênticas.`;
  } else {
    poeticSummary = `Um mês de reflexões e palavras: suas anotações teceram um testemunho valioso do seu caminho.`;
  }

  return {
    year,
    month,
    monthLabel: `${MONTH_NAMES[month]} de ${year}`,
    totalRecords: monthRecords.length,
    photosCount,
    audiosCount,
    videosCount,
    docsCount,
    topTags: sortedTags,
    topCategory,
    activeDaysCount: daysSet.size,
    highlightRecords,
    poeticSummary,
  };
}
