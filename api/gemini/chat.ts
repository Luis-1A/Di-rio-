import { GoogleGenAI } from '@google/genai';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

export default async function handler(req: any, res: any) {
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
        error: 'Chave do Gemini (GEMINI_API_KEY) não configurada no ambiente.',
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
    } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const personalityTone = iauProfile.personalityTone || 'natural';
    const responseLength = iauProfile.responseLength || 'adaptive';
    const customInstructions = iauProfile.customInstructions || '';

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

CONTEXTO DE REGISTROS RELEVANTES DO DIÁRIO (incluindo notas, fotos, documentos e transcrições de áudios):
${relevantRecords.length > 0 ? JSON.stringify(relevantRecords, null, 2) : 'Nenhum registro específico retornado para esta consulta.'}
`;

    // Build conversation contents
    const formattedContents: any[] = [];

    // Include recent conversation messages (immediate memory)
    const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
    for (const msg of recentHistory) {
      formattedContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Add current message
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

    const replyText = response.text || 'Não consegui processar uma resposta no momento.';

    // Extract new potential memories in the background
    let suggestedMemories: any[] = [];
    try {
      const memoryAnalysisPrompt = `
Analise a mensagem do usuário e a resposta abaixo.
Mensagem do Usuário: "${message}"
Resposta da IAU: "${replyText}"

Identifique se o usuário compartilhou algum fato permanente relevante sobre sua vida, preferências, projetos, eventos importantes ou relações pessoais que valha a pena guardar na Memória de Longo Prazo.
Se NÃO houver nada duradouro, retorne um array vazio [].
Se houver, retorne uma lista de objetos JSON com:
- title: título curto da memória (ex: "Preferência por café sem açúcar", "Início do projeto X")
- summary: síntese objetiva em 1-2 frases
- category: "preference" | "life_event" | "relationship" | "project" | "thought" | "habit"
- confidence: número entre 0.7 e 1.0
- tags: lista de tags curtas

Retorne APENAS um array JSON válido.`;

      const memoryAiRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: memoryAnalysisPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      if (memoryAiRes.text) {
        const parsed = JSON.parse(memoryAiRes.text);
        if (Array.isArray(parsed)) {
          suggestedMemories = parsed;
        }
      }
    } catch (err) {
      console.warn('Memory extraction skipped or failed:', err);
    }

    return res.status(200).json({
      reply: replyText,
      suggestedMemories,
      referencedRecordIds: relevantRecords.map((r: any) => r.id),
      referencedMemoryIds: relevantMemories.map((m: any) => m.id),
    });
  } catch (error: any) {
    console.error('Error in Vercel /api/gemini/chat:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao processar conversa com a IAU Central.',
    });
  }
}
