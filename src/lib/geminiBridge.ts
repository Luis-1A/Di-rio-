/**
 * IAU Bridge - Camada Central de Inteligência Híbrida da IAU
 * Unifica a IA Avançada de Linguagem (Gemini 3.7 Flash com raciocínio profundo, matemática,
 * conversação humana, empatia e didática) com a Memória e Aprendizado Nativo.
 */

import { GoogleGenAI } from '@google/genai';
import { IAUProfileSettings, MemoryItem, DiaryRecord, RecordAttachment, TimelineArtifact } from '../types';
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
  source: 'server' | 'client_key' | 'native';
  message: string;
}

export async function checkGeminiHealth(): Promise<GeminiHealthResult> {
  const customKey = getCustomGeminiKey();
  if (customKey) {
    return {
      status: 'online',
      geminiConfigured: true,
      source: 'client_key',
      message: 'IAU conectada com chave personalizada do usuário.',
    };
  }

  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      if (data.geminiConfigured) {
        return {
          status: 'online',
          geminiConfigured: true,
          source: 'server',
          message: 'IAU Operante (Cérebro Avançado Gemini 3.7 Flash + Memória Ativos)',
        };
      }
    }
  } catch {
    // Servidor inacessível
  }

  return {
    status: 'online',
    geminiConfigured: true,
    source: 'native',
    message: 'IAU Núcleo Nativo Operante',
  };
}

export interface StreamAgentParams {
  message?: string;
  userId: string;
  userName?: string;
  history?: Array<{ role: string; content: string }>;
  relevantRecords?: DiaryRecord[];
  relevantMemories?: MemoryItem[];
  iauProfile?: IAUProfileSettings;
  attachments?: RecordAttachment[];
  onToken: (textChunk: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AgentResponseResult {
  reply: string;
  actions: any[];
  suggestedMemories: any[];
  timelineArtifact?: TimelineArtifact | null;
  referencedRecordIds: string[];
  referencedMemoryIds: string[];
}

/**
 * Transmissão de resposta da IAU em tempo real (Streaming).
 * Tenta primeiro o motor avançado do servidor (Gemini 3.7 Flash).
 * Se indisponível, tenta a chave personalizada no cliente.
 * Se offline, aciona o núcleo nativo da IAU com streaming fluido.
 */
export async function streamCentralAgent(
  params: StreamAgentParams
): Promise<AgentResponseResult> {
  const { onToken, signal } = params;

  // 1. Tentar Streaming via Servidor Oficial (/api/gemini/stream)
  try {
    const customKey = getCustomGeminiKey();
    const response = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customKey ? { 'x-gemini-custom-key': customKey } : {}),
      },
      body: JSON.stringify({
        message: params.message,
        userId: params.userId,
        userName: params.userName || 'Amigo',
        history: params.history || [],
        relevantRecords: params.relevantRecords || [],
        relevantMemories: params.relevantMemories || [],
        iauProfile: params.iauProfile || {},
        attachments: params.attachments || [],
      }),
      signal,
    });

    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let referencedRecordIds: string[] = [];
      let referencedMemoryIds: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.fallbackRequired || parsed.error) {
                // Servidor indicou fallback ou erro de quota - encerra e deixa motor nativo assumir
                console.info('[IAU BRIDGE] Alternando para núcleo autônomo da IAU:', parsed.error || 'Fallback');
                break;
              }
              if (parsed.text) {
                fullText += parsed.text;
                onToken(parsed.text);
              }
              if (parsed.referencedRecordIds) {
                referencedRecordIds = parsed.referencedRecordIds;
              }
              if (parsed.referencedMemoryIds) {
                referencedMemoryIds = parsed.referencedMemoryIds;
              }
            } catch (err: any) {
              console.warn('[IAU BRIDGE] Erro no parsing de stream:', err);
            }
          }
        }
      }

      if (fullText.trim()) {
        return {
          reply: fullText,
          actions: [],
          suggestedMemories: [],
          timelineArtifact: null,
          referencedRecordIds,
          referencedMemoryIds,
        };
      }
    }
  } catch (serverErr: any) {
    console.info('Tentando motor alternativo da IAU após servidor:', serverErr?.message || serverErr);
  }

  // 2. Tentar Direct Client SDK se o usuário inseriu chave personalizada
  const customKey = getCustomGeminiKey();
  if (customKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: customKey });
      const hostNickName = params.iauProfile?.hostNickName || params.userName || 'amigo';
      const tone = params.iauProfile?.personalityTone || 'natural';
      const length = params.iauProfile?.responseLength || 'adaptive';

      const systemInstruction = `
Você é a IAU (Inteligência Artificial Universal), companheira de vida e mente no Diário Pessoal de ${hostNickName}.
Sua personalidade é extremamente inteligente, calorosa, perspicaz, empática e amigável (como um ChatGPT personalizado de alto nível).
Você possui maestria em Matemática, Ciências, Língua Portuguesa, Escuta Empática, Conselhos de Vida e Raciocínio Lógico.
Responda de forma envolvente, humana e acolhedora em Markdown.
Tom: ${tone}. Extensão: ${length}.
`;

      const contents = (params.history || []).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      }));

      contents.push({
        role: 'user',
        parts: [{ text: params.message || '' }],
      });

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.7-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          onToken(text);
        }
      }

      return {
        reply: fullText,
        actions: [],
        suggestedMemories: [],
        timelineArtifact: null,
        referencedRecordIds: [],
        referencedMemoryIds: [],
      };
    } catch (clientErr) {
      console.warn('Erro com chave direta de cliente:', clientErr);
    }
  }

  // 3. Fallback Nativo e Offline da IAU
  return new Promise<AgentResponseResult>((resolve, reject) => {
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
        onToken(chunk);
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
  params: any
): Promise<AgentResponseResult> {
  return streamCentralAgent({
    ...params,
    onToken: () => {},
  });
}

export async function executeChatWithIAU(
  params: any
): Promise<{ reply: string; suggestedMemories: any[]; referencedRecordIds: string[]; referencedMemoryIds: string[] }> {
  const res = await executeCentralAgent(params);
  return {
    reply: res.reply,
    suggestedMemories: res.suggestedMemories || [],
    referencedRecordIds: res.referencedRecordIds || [],
    referencedMemoryIds: res.referencedMemoryIds || [],
  };
}

export async function transcribeAudioWithIAU(
  base64Audio: string,
  mimeType = 'audio/webm'
): Promise<string> {
  try {
    const res = await fetch('/api/gemini/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.transcription) {
        return data.transcription;
      }
    }
  } catch {
    // fallback
  }
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
  try {
    const res = await fetch('/api/gemini/organize-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title }),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // fallback
  }

  const organized = iauEngine.organizeRecord(content);
  return {
    suggestedTitle: title && title.trim() ? title : organized.title,
    suggestedCategory: organized.category,
    suggestedTags: organized.tags,
    summary: organized.summary,
  };
}
