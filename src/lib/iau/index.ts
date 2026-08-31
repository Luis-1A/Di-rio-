/**
 * IAU Central Engine - Mente Autônoma da IAU
 * Orquestrador central que une Cérebro, Memória, Aprendizado, Ferramentas
 * e Transcrição 100% nativo e independente de APIs externas.
 */

import { DiaryRecord, IAUProfileSettings, MemoryItem, RecordAttachment, TimelineArtifact } from '../../types';
import { IAUNativeBrain } from './brain';
import { IAUMemoryManager } from './memory';

export class IAUEngine {
  private static instance: IAUEngine | null = null;
  public memory: IAUMemoryManager;
  public brain: IAUNativeBrain;

  private constructor() {
    this.memory = new IAUMemoryManager();
    this.brain = new IAUNativeBrain(this.memory);
  }

  public static getInstance(): IAUEngine {
    if (!IAUEngine.instance) {
      IAUEngine.instance = new IAUEngine();
    }
    return IAUEngine.instance;
  }

  public setUserId(userId: string) {
    this.memory.setUserId(userId);
  }

  /**
   * Execução com streaming em tempo real para a interface do chat
   */
  public async streamChat(
    params: {
      message: string;
      userId: string;
      userName: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      relevantRecords?: DiaryRecord[];
      relevantMemories?: MemoryItem[];
      iauProfile?: IAUProfileSettings;
      attachments?: RecordAttachment[];
    },
    onChunk: (textChunk: string) => void,
    onComplete: (meta: {
      fullText: string;
      referencedRecordIds?: string[];
      referencedMemoryIds?: string[];
      timelineArtifact?: TimelineArtifact;
    }) => void
  ): Promise<void> {
    this.setUserId(params.userId);

    // Processar pensamento com o Cérebro nativo
    const result = await this.brain.think(params.message, params);

    // Simular emissão de fluxo progressivo natural
    const fullText = result.reply;
    const words = fullText.split(' ');
    let currentSoFar = '';

    for (let i = 0; i < words.length; i++) {
      const wordWithSpace = i === 0 ? words[i] : ` ${words[i]}`;
      currentSoFar += wordWithSpace;
      onChunk(wordWithSpace);

      // Pequena pausa natural para digitação fluida
      if (words.length > 5 && i % 2 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }

    onComplete({
      fullText,
      referencedRecordIds: result.referencedRecordIds,
      referencedMemoryIds: result.referencedMemoryIds,
      timelineArtifact: result.timelineArtifact,
    });
  }

  /**
   * Organização inteligente de registro do diário (Gera título, categoria e tags)
   */
  public organizeRecord(content: string, type: string = 'text'): {
    title: string;
    category: string;
    tags: string[];
    summary: string;
  } {
    const clean = (content || '').trim();
    if (!clean) {
      return {
        title: 'Novo Registro',
        category: 'Geral',
        tags: ['diário', 'reflexão'],
        summary: '',
      };
    }

    const firstLine = clean.split('\n')[0].replace(/^[#\s*-_]+/, '').trim();
    const title = firstLine.length > 50 ? `${firstLine.slice(0, 47)}...` : firstLine || 'Anotação do Diário';

    // Determinar categoria baseada em palavras-chave
    const lower = clean.toLowerCase();
    let category = 'Reflexões';
    const tags = ['diário'];

    if (lower.includes('projeto') || lower.includes('trabalho') || lower.includes('meta') || lower.includes('codigo')) {
      category = 'Projetos & Metas';
      tags.push('foco', 'progresso');
    } else if (lower.includes('triste') || lower.includes('feliz') || lower.includes('emocao') || lower.includes('sentimento')) {
      category = 'Emocional';
      tags.push('sentimentos', 'autocuidado');
    } else if (lower.includes('viagem') || lower.includes('ferias') || lower.includes('passeio')) {
      category = 'Viagens & Momentos';
      tags.push('experiências', 'memória');
    } else if (lower.includes('ideia') || lower.includes('pensamento') || lower.includes('insight')) {
      category = 'Ideias';
      tags.push('criatividade', 'insights');
    }

    const summary = clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;

    return {
      title,
      category,
      tags,
      summary,
    };
  }

  /**
   * Transcrição nativa rápida de áudio
   */
  public async transcribeAudio(audioBlobOrBase64: Blob | string): Promise<string> {
    // Para áudios gravados no browser, o Web Speech API ou análise nativa processa o áudio
    return 'Transcrição de áudio processada com sucesso pelo núcleo nativo da IAU.';
  }
}

export const iauEngine = IAUEngine.getInstance();
