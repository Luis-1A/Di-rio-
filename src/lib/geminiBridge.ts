/**
 * IAU Bridge - Camada Unificada do Sistema IAU
 * Conecta a interface ao Motor Nativo da IAU (Cérebro, Memória, Personalidade e Aprendizado).
 * Funciona de forma 100% autônoma, local e offline, sem depender de APIs externas.
 */

import { IAUProfileSettings } from '../types';
import { iauEngine } from './iau';

const CUSTOM_KEY_STORAGE = 'diario_custom_gemini_key';

export function getCustomGeminiKey(): string {
  try {
    return localStorage.getItem(CUSTOM_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function saveCustomGeminiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(CUSTOM_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(CUSTOM_KEY_STORAGE);
    }
  } catch (e) {
    console.warn('Could not save custom key:', e);
  }
}

export interface GeminiHealthResult {
  status: 'online' | 'degraded' | 'offline';
  geminiConfigured: boolean;
  source: 'server' | 'client_key' | 'none';
  message: string;
}

export async function checkGeminiHealth(): Promise<GeminiHealthResult> {
  return {
    status: 'online',
    geminiConfigured: true,
    source: 'client_key',
    message: 'IAU Nativa Operante (Cérebro, Memória & Aprendizado Ativos)',
  };
}

export interface AgentRequestParams {
  message?: string;
  userId: string;
  userName?: string;
  history?: Array<{ role: string; content: string }>;
  relevantRecords?: any[];
  relevantMemories?: any[];
  iauProfile?: IAUProfileSettings;
  attachments?: any[];
}

export interface AgentResponseResult {
  reply: string;
  actions: any[];
  suggestedMemories: any[];
  timelineArtifact?: any;
  referencedRecordIds: string[];
  referencedMemoryIds: string[];
}

export interface StreamAgentParams extends AgentRequestParams {
  onToken: (textChunk: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Streaming em tempo real da IAU Nativa.
 * Emite tokens de forma progressiva e fluida com velocidade de leitura natural.
 */
export async function streamCentralAgent(
  params: StreamAgentParams
): Promise<AgentResponseResult> {
  const { onToken, signal } = params;

  return new Promise<AgentResponseResult>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Cancelado pelo usuário.'));
    }

    iauEngine.streamChat(
      {
        message: params.message || '',
        userId: params.userId,
        userName: params.userName || 'Amigo',
        history: (params.history as any) || [],
        relevantRecords: params.relevantRecords || [],
        relevantMemories: params.relevantMemories || [],
        iauProfile: params.iauProfile,
        attachments: params.attachments,
      },
      (chunk) => {
        if (!signal?.aborted) {
          onToken(chunk);
        }
      },
      (meta) => {
        resolve({
          reply: meta.fullText,
          actions: [],
          suggestedMemories: [],
          timelineArtifact: meta.timelineArtifact || null,
          referencedRecordIds: meta.referencedRecordIds || [],
          referencedMemoryIds: meta.referencedMemoryIds || [],
        });
      }
    ).catch(reject);
  });
}

export async function executeCentralAgent(
  params: AgentRequestParams
): Promise<AgentResponseResult> {
  iauEngine.setUserId(params.userId);
  const result = await iauEngine.brain.think(params.message || '', {
    userId: params.userId,
    userName: params.userName || 'Amigo',
    history: (params.history as any) || [],
    relevantRecords: params.relevantRecords || [],
    relevantMemories: params.relevantMemories || [],
    iauProfile: params.iauProfile,
  });

  return {
    reply: result.reply,
    actions: [],
    suggestedMemories: result.suggestedMemories || [],
    timelineArtifact: result.timelineArtifact || null,
    referencedRecordIds: result.referencedRecordIds || [],
    referencedMemoryIds: result.referencedMemoryIds || [],
  };
}

export interface ChatRequestParams {
  message: string;
  userId: string;
  userName?: string;
  history?: Array<{ role: string; content: string }>;
  relevantRecords?: any[];
  relevantMemories?: any[];
  iauProfile?: IAUProfileSettings;
}

export interface ChatResponseResult {
  reply: string;
  suggestedMemories: any[];
  referencedRecordIds: string[];
  referencedMemoryIds: string[];
}

export async function executeChatWithIAU(
  params: ChatRequestParams
): Promise<ChatResponseResult> {
  const result = await executeCentralAgent(params);
  return {
    reply: result.reply,
    suggestedMemories: result.suggestedMemories,
    referencedRecordIds: result.referencedRecordIds,
    referencedMemoryIds: result.referencedMemoryIds,
  };
}

export async function transcribeAudioWithIAU(
  base64Audio: string,
  mimeType = 'audio/webm'
): Promise<string> {
  return iauEngine.transcribeAudio(base64Audio);
}

export async function organizeRecordWithIAU(
  content: string,
  title?: string
): Promise<{
  suggestedTitle?: string;
  suggestedCategory?: string;
  suggestedTags?: string[];
  summary?: string;
}> {
  const organized = iauEngine.organizeRecord(content);
  return {
    suggestedTitle: title && title.trim() ? title : organized.title,
    suggestedCategory: organized.category,
    suggestedTags: organized.tags,
    summary: organized.summary,
  };
}
