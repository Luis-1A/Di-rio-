import { GoogleGenAI } from '@google/genai';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

function sanitizeMemoriesForPrompt(memories: any[] = []): any[] {
  if (!Array.isArray(memories)) return [];
  return memories.slice(0, 8).map((m) => ({
    id: m.id || '',
    title: m.title || '',
    summary: m.summary || '',
    category: m.category || 'thought',
    confidence: m.confidence || 0.8,
  }));
}

function sanitizeRecordsForPrompt(records: any[] = []): any[] {
  if (!Array.isArray(records)) return [];
  return records.slice(0, 8).map((r) => ({
    id: r.id || '',
    title: r.title || 'Sem título',
    content: (r.content || '').slice(0, 800),
    type: r.type || 'text',
    date: r.date || '',
    tags: r.tags || [],
  }));
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: 'Chave do Gemini (GEMINI_API_KEY) não configurada no servidor.',
      });
    }

    const {
      message,
      userId,
      userName,
      history = [],
      relevantRecords = [],
      relevantMemories = [],
      iauProfile = {},
      attachments = [],
    } = req.body || {};

    if (!message && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const personalityTone = iauProfile.personalityTone || 'natural';
    const responseLength = iauProfile.responseLength || 'adaptive';
    const customInstructions = iauProfile.customInstructions || '';
    const hostNickName = iauProfile.hostNickName || userName || 'Usuário';
    const hostTraits = iauProfile.hostPersonaTraits || '';
    const hostIntimacy = iauProfile.hostIntimacyLevel || 'companion';

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

    const currentTimeStr = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const cleanMemories = sanitizeMemoriesForPrompt(relevantMemories);
    const cleanRecords = sanitizeRecordsForPrompt(relevantRecords);

    const systemInstruction = `
Você é a IAU (Inteligência Artificial Universal), a mente central, conselheira e companheira de vida no Diário Pessoal de ${hostNickName} (UID: ${userId}).
Data e hora atual de referência: 30 de Agosto de 2026, às ${currentTimeStr} (Horário de Brasília).

DIRETRIZES DA IAU:
- Sua personalidade é calorosa, amigável, autêntica, viva e acolhedora.
- Para saudações cotidianas ("Oi", "Olá", "Tudo bem?", etc.), responda com entusiasmo, leveza e simpatia imediata.
- Nível de proximidade: ${intimacyGuidance}
- Tom: ${toneGuidance}
- Extensão: ${lengthGuidance}
- Traços do hospedeiro: ${hostTraits || 'Autêntico e reflexivo'}.
${customInstructions ? `Instruções personalizadas: ${customInstructions}` : ''}

CONTEXTO DE MEMÓRIAS DO USUÁRIO:
${cleanMemories.length > 0 ? JSON.stringify(cleanMemories, null, 2) : 'Nenhuma memória pregressa indexada para esta mensagem específica.'}

CONTEXTO DE REGISTROS DO DIÁRIO:
${cleanRecords.length > 0 ? JSON.stringify(cleanRecords, null, 2) : 'Nenhum registro específico retornado para esta consulta.'}

Responda em formato JSON estruturado com a chave principal "reply":
{
  "reply": "Sua resposta viva, acolhedora e conversacional em Markdown",
  "actions": [],
  "suggestedMemories": [],
  "timelineArtifact": null
}
`;

    const formattedContents: any[] = [];
    const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
    for (const msg of recentHistory) {
      formattedContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    const currentParts: any[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.url && att.url.startsWith('data:') && att.mimeType?.startsWith('image/')) {
          const clean = att.url.replace(/^data:image\/[a-zA-Z0-9_-]+;base64,/, '');
          currentParts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: clean,
            },
          });
        }
      }
    }
    if (message) {
      currentParts.push({ text: message });
    }

    formattedContents.push({
      role: 'user',
      parts: currentParts,
    });

    const candidateModels = ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
    let aiResponseText = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: formattedContents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });
        aiResponseText = response.text || '';
        if (aiResponseText) break;
      } catch (err: any) {
        console.warn(`[GEMINI AGENT VERCEL] Falha com modelo ${model}:`, err?.message || err);
      }
    }

    if (!aiResponseText) {
      return res.status(500).json({
        error: 'Não foi possível obter resposta dos modelos do Gemini. Tente novamente em instantes.',
      });
    }

    let parsed: any = {};
    try {
      let raw = aiResponseText.trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: aiResponseText };
    }

    return res.status(200).json({
      reply: parsed.reply || aiResponseText,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      suggestedMemories: Array.isArray(parsed.suggestedMemories) ? parsed.suggestedMemories : [],
      timelineArtifact: parsed.timelineArtifact || null,
      referencedRecordIds: relevantRecords.map((r: any) => r.id),
      referencedMemoryIds: relevantMemories.map((m: any) => m.id),
    });
  } catch (error: any) {
    console.error('Error in Vercel /api/gemini/agent:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao processar agente central IAU.',
    });
  }
}
