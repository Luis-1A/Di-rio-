/**
 * Milestone & Meaningful Gamification Engine
 * Rewards personal history exploration without guilt, streak pressure, or loss of XP.
 */
import { DiaryRecord, Milestone, TimeCapsule } from '../types';

export function calculateMilestones(
  records: DiaryRecord[],
  capsules: TimeCapsule[] = []
): Milestone[] {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const totalCount = activeRecords.length;
  const photoCount = activeRecords.filter((r) => r.type === 'photo').length;
  const audioCount = activeRecords.filter((r) => r.type === 'audio').length;
  const reflectionCount = activeRecords.reduce(
    (acc, r) => acc + (r.reflections?.length || 0),
    0
  );
  const capsuleCount = capsules.length;

  // Unique months with recordings
  const uniqueMonths = new Set(
    activeRecords.map((r) => {
      const d = r.date || r.createdAt;
      return d.slice(0, 7); // YYYY-MM
    })
  );

  const milestones: Milestone[] = [
    {
      id: 'first_record',
      title: 'Primeira Lembrança',
      description: 'O início da sua jornada: você registrou o primeiro fragmento da sua história.',
      icon: 'sparkles',
      unlocked: totalCount >= 1,
      category: 'habit',
      progress: { current: Math.min(totalCount, 1), total: 1 },
    },
    {
      id: 'voice_preserved',
      title: 'Voz Preservada',
      description: 'Guardou um registro em áudio, preservando seu jeito de falar nesta época.',
      icon: 'mic',
      unlocked: audioCount >= 1,
      category: 'multimedia',
      progress: { current: Math.min(audioCount, 1), total: 1 },
    },
    {
      id: 'photo_eye',
      title: 'Olhar Fotográfico',
      description: 'Eternizou momentos visuais e cores que marcaram os seus dias.',
      icon: 'camera',
      unlocked: photoCount >= 1,
      category: 'multimedia',
      progress: { current: Math.min(photoCount, 1), total: 1 },
    },
    {
      id: 'time_bridge',
      title: 'Ponte no Tempo (Antes e Agora)',
      description: 'Revisitou uma memória do passado e registrou o que pensa sobre ela hoje.',
      icon: 'git-compare',
      unlocked: reflectionCount >= 1,
      category: 'depth',
      progress: { current: Math.min(reflectionCount, 1), total: 1 },
    },
    {
      id: 'time_capsule_sealed',
      title: 'Cápsula Selada',
      description: 'Enviou uma carta para o seu Eu do Futuro com data para ser aberta.',
      icon: 'hourglass',
      unlocked: capsuleCount >= 1,
      category: 'time',
      progress: { current: Math.min(capsuleCount, 1), total: 1 },
    },
    {
      id: 'ten_moments',
      title: '10 Momentos Registrados',
      description: 'Uma constelação de 10 memórias que contam quem você é.',
      icon: 'award',
      unlocked: totalCount >= 10,
      category: 'habit',
      progress: { current: Math.min(totalCount, 10), total: 10 },
    },
    {
      id: 'multi_month',
      title: 'Capítulos da Vida',
      description: 'Momentos guardados em 2 ou mais meses diferentes.',
      icon: 'book-open',
      unlocked: uniqueMonths.size >= 2,
      category: 'time',
      progress: { current: Math.min(uniqueMonths.size, 2), total: 2 },
    },
    {
      id: 'fifty_moments',
      title: '50 Capítulos Guardados',
      description: 'Seu diário se tornou um tesouro inestimável da sua própria trajetória.',
      icon: 'compass',
      unlocked: totalCount >= 50,
      category: 'habit',
      progress: { current: Math.min(totalCount, 50), total: 50 },
    },
    {
      id: 'century_archive',
      title: '100 Memórias Eternizadas',
      description: 'Um acervo magnífico que preserva um ano inteiro de sentimentos e aprendizados.',
      icon: 'crown',
      unlocked: totalCount >= 100,
      category: 'habit',
      progress: { current: Math.min(totalCount, 100), total: 100 },
    },
  ];

  return milestones;
}

export const DEFAULT_COLLECTIONS = [
  { id: 'viagens', name: 'Viagens', icon: 'plane', color: '#C9A4DC' },
  { id: 'amizades', name: 'Amizades', icon: 'heart', color: '#F48FB1' },
  { id: 'ideias', name: 'Ideias', icon: 'lightbulb', color: '#FFE082' },
  { id: 'fases', name: 'Fases da vida', icon: 'leaf', color: '#81C784' },
];

export function calculateUserGamification(
  records: DiaryRecord[],
  capsules: TimeCapsule[] = []
) {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const totalCount = activeRecords.length;
  const photoCount = activeRecords.filter((r) => r.type === 'photo').length;
  const audioCount = activeRecords.filter((r) => r.type === 'audio').length;
  const reflectionCount = activeRecords.reduce(
    (acc, r) => acc + (r.reflections?.length || 0),
    0
  );
  const capsuleCount = capsules.length;

  const totalXp =
    totalCount * 25 +
    photoCount * 15 +
    audioCount * 20 +
    reflectionCount * 35 +
    capsuleCount * 40;

  // Level thresholds:
  // Level 1: 0 - 150
  // Level 2: 150 - 300
  // Level 3: 300 - 500 (320/500 XP)
  // Level 4: 500 - 800
  // Level 5: 800+
  if (totalXp < 150) {
    return {
      xp: totalXp,
      level: 1,
      nextLevelXp: 150,
      levelTitle: 'Iniciante Curioso',
    };
  } else if (totalXp < 300) {
    return {
      xp: totalXp,
      level: 2,
      nextLevelXp: 300,
      levelTitle: 'Explorador da Memória',
    };
  } else if (totalXp < 500) {
    return {
      xp: totalXp,
      level: 3,
      nextLevelXp: 500,
      levelTitle: 'Guardião da Própria História',
    };
  } else if (totalXp < 800) {
    return {
      xp: totalXp,
      level: 4,
      nextLevelXp: 800,
      levelTitle: 'Mestre da Vida',
    };
  } else {
    return {
      xp: totalXp,
      level: 5,
      nextLevelXp: 1200,
      levelTitle: 'Filósofo do Tempo',
    };
  }
}
