import { GoogleGenAI } from '@google/genai';
import { DiaryRecord, MemoryItem, IAUProfileSettings } from '../types';

const CUSTOM_KEY_STORAGE = 'diario_custom_gemini_key';

export function getCustomGeminiKey(): string {
  try {
    const metaEnv = (import.meta as any).env;
    const viteKey = metaEnv?.VITE_GEMINI_API_KEY || '';
    return (
      localStorage.getItem(CUSTOM_KEY_STORAGE) ||
      viteKey ||
      ''
    ).trim();
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
    console.warn('Could not save custom gemini key:', e);
  }
}

export interface GeminiHealthResult {
  status: 'online' | 'degraded' | 'offline';
  geminiConfigured: boolean;
  source: 'server' | 'client_key' | 'none';
  message: string;
}

export async function checkGeminiHealth(): Promise<GeminiHealthResult> {
  // 1. Check server API health
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/health', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.geminiConfigured) {
          return {
            status: 'online',
            geminiConfigured: true,
            source: 'server',
            message: 'IAU Central conectada via Servidor / Cloud API.',
          };
        } else {
          // Check if user has a client-side key saved as fallback
          const clientKey = getCustomGeminiKey();
          if (clientKey) {
            return {
              status: 'online',
              geminiConfigured: true,
              source: 'client_key',
              message: 'IAU Central conectada via Chave Direta do Usuário.',
            };
          }
          return {
            status: 'degraded',
            geminiConfigured: false,
            source: 'server',
            message: 'Servidor online, mas chave GEMINI_API_KEY não configurada.',
          };
        }
      }
    }
  } catch (e) {
    // Server endpoint unreachable (e.g. static hosting on Vercel)
  }

  // 2. Check Client-side Key fallback
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    return {
      status: 'online',
      geminiConfigured: true,
      source: 'client_key',
      message: 'IAU Central conectada via Chave Direta do Usuário.',
    };
  }

  return {
    status: 'offline',
    geminiConfigured: false,
    source: 'none',
    message: 'IAU Central Offline. Configure GEMINI_API_KEY no servidor ou insira sua chave.',
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

export async function executeCentralAgent(
  params: AgentRequestParams
): Promise<AgentResponseResult> {
  const res = await fetch('/api/gemini/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (res.ok) {
    const data = await res.json();
    return {
      reply: data.reply || 'Compreendido.',
      actions: Array.isArray(data.actions) ? data.actions : [],
      suggestedMemories: Array.isArray(data.suggestedMemories) ? data.suggestedMemories : [],
      timelineArtifact: data.timelineArtifact || null,
      referencedRecordIds: data.referencedRecordIds || [],
      referencedMemoryIds: data.referencedMemoryIds || [],
    };
  } else {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
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
  const {
    message,
    userId,
    userName,
    history = [],
    relevantRecords = [],
    relevantMemories = [],
    iauProfile,
  } = params;

  // 1. Try Server Endpoint (/api/gemini/chat)
  let serverError = '';
  try {
    const res = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          reply: data.reply || 'Processado com sucesso.',
          suggestedMemories: data.suggestedMemories || [],
          referencedRecordIds: data.referencedRecordIds || [],
          referencedMemoryIds: data.referencedMemoryIds || [],
        };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      serverError = errData.error || `HTTP ${res.status}`;
    }
  } catch (err: any) {
    serverError = err.message || 'Falha de conexão com /api/gemini/chat';
  }

  // 2. Client-Side Fallback via @google/genai
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: clientKey });

      const personalityTone = iauProfile?.personalityTone || 'natural';
      const responseLength = iauProfile?.responseLength || 'adaptive';
      const customInstructions = iauProfile?.customInstructions || '';

      const lengthGuidance = {
        short: 'Seja sucinto, direto ao ponto e conciso (1 a 3 parágrafos curtos).',
        medium: 'Dê respostas balanceadas, bem organizadas e claras.',
        long: 'Forneça respostas completas, aprofundadas e detalhadas com riqueza de explicações.',
        adaptive: 'Adapte a extensão da resposta naturalmente de acordo com a complexidade da pergunta do usuário.',
      }[responseLength as string] || 'Adapte a extensão conforme a pergunta.';

      const toneGuidance = {
        natural: 'Tom natural, conversacional, autêntico e inteligente.',
        thoughtful: 'Tom reflexivo, profundo, cuidadoso e analítico.',
        witty: 'Tom espirituoso, espontâneo e com pitadas leves de humor inteligente quando apropriado.',
        direct: 'Tom objetivo, prático, sem rodeios e focado na solução.',
        empathetic: 'Tom caloroso, acolhedor, empático e atencioso.',
      }[personalityTone as string] || 'Tom natural e inteligente.';

      const systemInstruction = `
Você é a IAU Central (Inteligência Artificial Universal), o cérebro do Diário Pessoal de ${userName || 'Usuário'} (UID: ${userId}).
Data e hora atual de referência: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (2026).

REGRAS FUNDAMENTAIS E INEGOCIÁVEIS:
1. PRIVACIDADE E ISOLAMENTO: Você tem acesso EXCLUSIVAMENTE aos dados deste usuário. Nunca mencione outros usuários nem invente dados externos.
2. VERACIDADE ABSOLUTA: Se algo não constar nos registros ou memórias fornecidos no contexto, NUNCA invente ou alucine fatos. Diga honestamente e com clareza: "Não encontrei nenhum registro correspondente nas suas memórias/diário."
3. MEMÓRIA DE LONGO PRAZO: Utilize os registros e memórias anexados abaixo para enriquecer a resposta com precisão factual.
4. PERSONALIDADE E ESTILO:
   - Estilo de resposta: ${toneGuidance}
   - Extensão de resposta: ${lengthGuidance}
   - Instruções personalizadas do usuário: ${customInstructions || 'Nenhuma instrução adicional.'}
   - Tenha respeito absoluto pelo tom do momento: nunca faça piadas se o usuário relatar tristeza, luto ou problema sério.
5. FORMATO DE SAÍDA: Responda em markdown elegante, limpo e direto.

CONTEXTO DE MEMÓRIAS RELEVANTES DO USUÁRIO:
${relevantMemories.length > 0 ? JSON.stringify(relevantMemories, null, 2) : 'Nenhuma memória pregressa indexada para esta consulta específica.'}

CONTEXTO DE REGISTROS RELEVANTES DO DIÁRIO:
${relevantRecords.length > 0 ? JSON.stringify(relevantRecords, null, 2) : 'Nenhum registro específico retornado para esta consulta.'}
`;

      const formattedContents: any[] = [];
      const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
      for (const msg of recentHistory) {
        formattedContents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
      formattedContents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      return {
        reply: response.text || 'Processado com sucesso.',
        suggestedMemories: [],
        referencedRecordIds: relevantRecords.map((r: any) => r.id),
        referencedMemoryIds: relevantMemories.map((m: any) => m.id),
      };
    } catch (clientErr: any) {
      throw new Error(`Falha no Gemini: ${clientErr.message || 'Erro de execução'}`);
    }
  }

  throw new Error(
    serverError ||
      'IAU Central Offline. Configure GEMINI_API_KEY no servidor da sua hospedagem ou insira a chave no Diagnóstico.'
  );
}

export async function transcribeAudioWithIAU(
  base64Audio: string,
  mimeType = 'audio/webm'
): Promise<string> {
  // 1. Try Server Endpoint
  try {
    const res = await fetch('/api/gemini/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Audio, mimeType }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.transcript) return data.transcript;
    }
  } catch (e) {
    // Server failed
  }

  // 2. Client-Side Fallback
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    const cleanBase64 = base64Audio.replace(/^data:audio\/[a-zA-Z0-9_-]+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey: clientKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: cleanBase64,
              },
            },
            {
              text: 'Transcreva este áudio em português com máxima fidelidade e pontuação correta. Retorne apenas o texto transcrito exato.',
            },
          ],
        },
      ],
    });
    return response.text?.trim() || '';
  }

  throw new Error('Serviço de transcrição indisponível.');
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
  // 1. Try Server Endpoint
  try {
    const res = await fetch('/api/gemini/organize-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Server failed
  }

  // 2. Client-Side Fallback
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    const ai = new GoogleGenAI({ apiKey: clientKey });
    const prompt = `
Analise o seguinte registro:
Título: "${title || ''}"
Conteúdo: "${content || ''}"

Sugira um JSON com suggestedTitle, suggestedCategory, suggestedTags (array de strings), summary.
Retorne APENAS um JSON válido.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    return JSON.parse(response.text || '{}');
  }

  return {};
}
