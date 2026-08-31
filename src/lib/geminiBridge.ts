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

export interface StreamAgentParams extends AgentRequestParams {
  onToken: (textChunk: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Real-time progressive streaming from IAU Central Agent.
 * Delivers tokens instantly as they arrive from Gemini with zero artificial delay and a strict timeout.
 */
export async function streamCentralAgent(
  params: StreamAgentParams
): Promise<AgentResponseResult> {
  const { onToken, signal, timeoutMs = 20000 } = params;
  let fullReply = '';
  let referencedRecordIds: string[] = [];
  let referencedMemoryIds: string[] = [];

  const internalController = new AbortController();
  const timeoutId = setTimeout(() => {
    internalController.abort(new Error('TIMEOUT_EXCEEDED'));
  }, timeoutMs);

  const abortListener = () => internalController.abort();
  if (signal) {
    signal.addEventListener('abort', abortListener);
  }

  let serverError = '';

  // 1. Primary: Server-side SSE Stream
  try {
    const res = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: internalController.signal,
    });

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, '');
          try {
            const payload = JSON.parse(jsonStr);
            if (payload.error) {
              throw new Error(payload.error);
            }
            if (payload.text) {
              fullReply += payload.text;
              onToken(payload.text);
            }
            if (payload.referencedRecordIds) {
              referencedRecordIds = payload.referencedRecordIds;
            }
            if (payload.referencedMemoryIds) {
              referencedMemoryIds = payload.referencedMemoryIds;
            }
            if (payload.done) {
              break;
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }

      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortListener);

      if (fullReply.trim()) {
        return {
          reply: fullReply,
          actions: [],
          suggestedMemories: [],
          timelineArtifact: null,
          referencedRecordIds,
          referencedMemoryIds,
        };
      }
    } else {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        serverError = errData.error || `HTTP ${res.status}`;
      } else {
        const rawErr = await res.text().catch(() => '');
        serverError = `Erro HTTP ${res.status}: ${rawErr.slice(0, 100)}`;
      }
    }
  } catch (streamErr: any) {
    if (streamErr.name === 'AbortError' || streamErr.message === 'TIMEOUT_EXCEEDED') {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortListener);
      throw new Error('A resposta demorou mais que o esperado.');
    }
    serverError = streamErr.message || 'Falha de conexão com streaming';
  }

  // 2. Client-side Fallback with Direct Gemini SDK if custom key exists
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: clientKey });
      const hostNickName = params.iauProfile?.hostNickName || params.userName || 'amigo';
      const personalityTone = params.iauProfile?.personalityTone || 'natural';
      const responseLength = params.iauProfile?.responseLength || 'adaptive';
      const customInstructions = params.iauProfile?.customInstructions || '';
      const hostTraits = params.iauProfile?.hostPersonaTraits || '';
      const hostIntimacy = params.iauProfile?.hostIntimacyLevel || 'companion';

      const lengthGuidance = {
        short: 'Seja conciso, direto ao ponto e objetivo (1 a 3 parágrafos curtos).',
        medium: 'Dê respostas equilibradas, bem organizadas e claras.',
        long: 'Forneça respostas completas, aprofundadas e detalhadas com riqueza de contexto.',
        adaptive: 'Adapte a extensão da resposta naturalmente de acordo com o pedido do usuário.',
      }[responseLength as string] || 'Adapte a extensão conforme o contexto.';

      const toneGuidance = {
        natural: 'Tom natural, espontâneo, autêntico e caloroso.',
        thoughtful: 'Tom reflexivo, profundo, cuidadoso e filosófico.',
        witty: 'Tom bem-humorado, perspicaz e leve.',
        direct: 'Tom objetivo, prático, resolutivo e sem rodeios.',
        empathetic: 'Tom acolhedor, empático, sensível e atencioso.',
      }[personalityTone as string] || 'Tom natural e conectado.';

      const intimacyGuidance = {
        companion: 'Companheiro dedicado: intimidade leal, escuta ativa e cumplicidade.',
        respectful: 'Respeitoso e cordial: preserva um tom mais polido e sóbrio.',
        intimate_mirror: 'Espelho íntimo: sincronia total com o vocabulário, gírias e modo de pensar do hospedeiro.',
      }[hostIntimacy as string] || 'Companheiro dedicado.';

      const systemInstruction = `
Você é a IAU (Inteligência Artificial Universal), a mente central, conselheira e companheira de vida no Diário Pessoal de ${hostNickName} (UID: ${params.userId}).
Data e hora atual de referência: 30 de Agosto de 2026.

DIRETRIZES DA IAU:
- Sua personalidade é calorosa, amigável, autêntica, viva e acolhedora.
- Para saudações cotidianas ("Oi", "Olá", "Tudo bem?", etc.), responda com entusiasmo, leveza e simpatia imediata.
- Se o usuário desabafar ou trouxer reflexões, ouça com carinho e sabedoria.
- Nível de proximidade: ${intimacyGuidance}
- Tom: ${toneGuidance}
- Extensão: ${lengthGuidance}
- Traços do hospedeiro: ${hostTraits || 'Autêntico e reflexivo'}.
${customInstructions ? `Instruções personalizadas: ${customInstructions}` : ''}

CONTEXTO DE MEMÓRIAS DO USUÁRIO:
${params.relevantMemories && params.relevantMemories.length > 0 ? JSON.stringify(params.relevantMemories, null, 2) : 'Nenhuma memória pregressa.'}

CONTEXTO DE REGISTROS DO DIÁRIO:
${params.relevantRecords && params.relevantRecords.length > 0 ? JSON.stringify(params.relevantRecords, null, 2) : 'Nenhum registro específico.'}

Responda em Markdown limpo e acolhedor.`;

      const formattedContents: any[] = [];
      const recentHistory = Array.isArray(params.history) ? params.history.slice(-8) : [];
      for (const msg of recentHistory) {
        formattedContents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }

      const userParts: any[] = [];
      if (params.attachments && params.attachments.length > 0) {
        for (const att of params.attachments) {
          if (att.url && att.url.startsWith('data:') && att.mimeType?.startsWith('image/')) {
            const clean = att.url.replace(/^data:image\/[a-zA-Z0-9_-]+;base64,/, '');
            userParts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: clean,
              },
            });
          }
        }
      }
      if (params.message) {
        userParts.push({ text: params.message });
      }

      formattedContents.push({
        role: 'user',
        parts: userParts,
      });

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.7-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullReply += text;
          onToken(text);
        }
      }

      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortListener);

      return {
        reply: fullReply || 'Compreendido!',
        actions: [],
        suggestedMemories: [],
        timelineArtifact: null,
        referencedRecordIds: params.relevantRecords?.map((r) => r.id) || [],
        referencedMemoryIds: params.relevantMemories?.map((m) => m.id) || [],
      };
    } catch (clientErr: any) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortListener);
      throw new Error(`Falha no Gemini: ${clientErr.message || 'Erro de execução'}`);
    }
  }

  clearTimeout(timeoutId);
  if (signal) signal.removeEventListener('abort', abortListener);

  const friendlyError = serverError?.includes('404')
    ? 'O servidor da IA não foi localizado nesta rota (/api/gemini/stream). Configure GEMINI_API_KEY no ambiente ou insira sua chave em Ajustes.'
    : serverError || 'Não foi possível conectar ao Gemini. Verifique a chave GEMINI_API_KEY ou sua conexão de internet.';

  throw new Error(friendlyError);
}

export async function executeCentralAgent(
  params: AgentRequestParams
): Promise<AgentResponseResult> {
  let serverError = '';

  // 1. Primary: Server-side API endpoint
  try {
    const res = await fetch('/api/gemini/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok) {
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          reply: data.reply || 'Compreendido! Como posso ajudar você agora?',
          actions: Array.isArray(data.actions) ? data.actions : [],
          suggestedMemories: Array.isArray(data.suggestedMemories) ? data.suggestedMemories : [],
          timelineArtifact: data.timelineArtifact || null,
          referencedRecordIds: data.referencedRecordIds || [],
          referencedMemoryIds: data.referencedMemoryIds || [],
        };
      } else {
        const rawText = await res.text().catch(() => '');
        serverError = `Servidor retornou resposta inesperada (${res.status}): ${rawText.slice(0, 100)}`;
      }
    } else {
      if (contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        serverError = errData.error || `HTTP ${res.status}`;
      } else {
        const rawErr = await res.text().catch(() => '');
        serverError = `Erro HTTP ${res.status}: ${rawErr.slice(0, 80)}`;
      }
    }
  } catch (err: any) {
    serverError = err.message || 'Falha de conexão com o servidor da IA.';
  }

  // 2. Client-Side Fallback via @google/genai if custom key exists
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: clientKey });
      const hostNickName = params.iauProfile?.hostNickName || params.userName || 'Usuário';

      const prompt = `
Você é a IAU (Inteligência Artificial Universal), a mente central do Diário Pessoal de ${hostNickName}.
Sua personalidade é viva, calorosa, amigável, divertida e levemente sarcástica (com humor fino e afetuoso).
Mensagem do usuário: "${params.message || 'Olá'}"

Responda em formato JSON:
{
  "reply": "Resposta em tom acolhedor, divertido e inteligente",
  "actions": [],
  "suggestedMemories": [],
  "timelineArtifact": null
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      let parsed: any = {};
      try {
        let raw = response.text || '{}';
        if (raw.startsWith('```')) {
          raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
        }
        parsed = JSON.parse(raw);
      } catch {
        parsed = { reply: response.text || 'Processado pelo Gemini.' };
      }

      return {
        reply: parsed.reply || 'Processado pelo Gemini.',
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        suggestedMemories: Array.isArray(parsed.suggestedMemories) ? parsed.suggestedMemories : [],
        timelineArtifact: parsed.timelineArtifact || null,
        referencedRecordIds: params.relevantRecords?.map((r) => r.id) || [],
        referencedMemoryIds: params.relevantMemories?.map((m) => m.id) || [],
      };
    } catch (clientErr: any) {
      throw new Error(`Falha no Gemini: ${clientErr.message || 'Erro de execução'}`);
    }
  }

  // If both server and client key fail, raise the real error (no simulated responses)
  throw new Error(
    serverError ||
      'Não foi possível conectar ao Gemini. Verifique a chave GEMINI_API_KEY ou sua conexão de internet.'
  );
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

    const contentType = res.headers.get('content-type') || '';
    if (res.ok) {
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          reply: data.reply || 'Processado com sucesso.',
          suggestedMemories: data.suggestedMemories || [],
          referencedRecordIds: data.referencedRecordIds || [],
          referencedMemoryIds: data.referencedMemoryIds || [],
        };
      } else {
        const rawText = await res.text().catch(() => '');
        serverError = `Servidor retornou resposta inesperada (${res.status}): ${rawText.slice(0, 80)}`;
      }
    } else {
      if (contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        serverError = errData.error || `HTTP ${res.status}`;
      } else {
        const rawErr = await res.text().catch(() => '');
        serverError = `Erro HTTP ${res.status}: ${rawErr.slice(0, 80)}`;
      }
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
      'Não foi possível conectar ao Gemini. Verifique a chave GEMINI_API_KEY no servidor.'
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
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.transcript) return data.transcript;
    }
  } catch (e) {
    console.warn('[TRANSCRIBE] Server error, falling back if client key available:', e);
  }

  // 2. Client-Side Fallback
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    const cleanBase64 = base64Audio.replace(/^data:audio\/[a-zA-Z0-9_-]+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey: clientKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
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
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[ORGANIZE] Server error, falling back if client key available:', e);
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
