/**
 * IAU Tools Engine - Execução de Ferramentas e Ações Autônomas
 * Permite à IAU pesquisar diários, gerar linhas do tempo, salvar memórias
 * e formular questionários de aprendizagem.
 */

import { DiaryRecord, MemoryItem, TimelineArtifact } from '../../types';
import { IAU_BASIC_EDUCATION_DATABASE, KnowledgeTopic } from './knowledgeBase';

export interface GeneratedQuiz {
  topicTitle: string;
  category: string;
  questions: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
}

export class IAUToolsEngine {
  /**
   * Constrói um artefato de Linha do Tempo baseado nos registros cronológicos do usuário
   */
  public static generateTimeline(records: DiaryRecord[], periodTitle?: string): TimelineArtifact {
    const active = records.filter((r) => !r.isDeleted);
    const sorted = [...active].sort((a, b) => {
      const dateA = new Date(`${a.date || '2026-01-01'}T${a.time || '12:00'}`);
      const dateB = new Date(`${b.date || '2026-01-01'}T${b.time || '12:00'}`);
      return dateB.getTime() - dateA.getTime();
    });

    const items = sorted.slice(0, 10).map((r) => ({
      date: r.date || 'Data não informada',
      title: r.title || 'Registro do Diário',
      summary: (r.content || '').slice(0, 180) + ((r.content || '').length > 180 ? '...' : ''),
      type: r.type || 'text',
      recordId: r.id,
    }));

    return {
      title: periodTitle || 'Linha do Tempo dos Seus Registros',
      period: `${items.length} acontecimentos recentes indexados`,
      items,
    };
  }

  /**
   * Gera um Quiz interativo para testar o usuário em um assunto
   */
  public static generateQuiz(topicQuery: string): GeneratedQuiz | null {
    const norm = topicQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Buscar tópico na base de conhecimento
    let matchedTopic: KnowledgeTopic | undefined;
    for (const t of IAU_BASIC_EDUCATION_DATABASE) {
      const titleNorm = t.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const catNorm = t.category.toLowerCase();
      const kwNorm = t.keywords.join(' ').toLowerCase();

      if (
        norm.includes(catNorm) ||
        norm.includes(titleNorm) ||
        t.keywords.some((k) => norm.includes(k)) ||
        kwNorm.includes(norm)
      ) {
        matchedTopic = t;
        break;
      }
    }

    // Se não encontrou tópico específico, usar Gramática ou Tecnologia como base
    if (!matchedTopic) {
      matchedTopic = IAU_BASIC_EDUCATION_DATABASE[0];
    }

    if (!matchedTopic.quizQuestions || matchedTopic.quizQuestions.length === 0) {
      return null;
    }

    return {
      topicTitle: matchedTopic.title,
      category: matchedTopic.category,
      questions: matchedTopic.quizQuestions.map((q, idx) => ({
        id: `q_${idx}_${Date.now()}`,
        question: q.question,
        options: q.options,
        correctIndex: q.correctAnswer,
        explanation: q.explanation,
      })),
    };
  }
}
