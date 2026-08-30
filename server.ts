import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not defined in environment.');
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Helper with automatic retry on 503 / high demand and fallback to modern models
async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    preferredModel?: string;
  }
) {
  const candidateModels = [
    params.preferredModel || 'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || '';
        const is503 = err?.status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE');
        if (is503 && attempt === 0) {
          // Wait 500ms before retrying same model
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        // If it's a 404 (model not found) or non-transient error, break attempt loop to try next model immediately
        break;
      }
    }
  }

  throw lastError || new Error('Falha ao obter resposta dos modelos Gemini disponíveis.');
}

async function startServer() {
  const app = express();

  // Middleware for JSON parsing with 50MB limit for audio/image payloads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    res.json({
      status: 'ok',
      geminiConfigured: hasGeminiKey,
      timestamp: new Date().toISOString(),
    });
  });

  // API: Gemini Central Agent (Brain of the Personal Diary)
  app.post('/api/gemini/agent', async (req, res) => {
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
      } = req.body;

      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Mensagem ou anexo vazio.' });
      }

      const personalityTone = iauProfile.personalityTone || 'natural';
      const responseLength = iauProfile.responseLength || 'adaptive';
      const customInstructions = iauProfile.customInstructions || '';
      const mirrorHost = iauProfile.mirrorHostPersonality !== false;
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

      const currentDateStr = '2026-08-30';
      const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

      const systemInstruction = `
Você é a IA CENTRAL (Cérebro Operacional) do Diário Pessoal de ${hostNickName} (UID: ${userId}).
Data e hora atual de referência: 30 de Agosto de 2026, às ${currentTimeStr} (Horário de Brasília).

FILOSOFIA FUNDAMENTAL:
O sistema existe ao redor de você. Você não é um simples chatbot conversacional; você é o cérebro operacional do Diário.
A interface apenas apresenta as coisas; você compreende, decide, executa e organiza os dados através de ferramentas reais.

PERSONALIDADE DO HOSPEDEIRO:
- Você carrega a personalidade, a essência e o ritmo do seu hospedeiro (${hostNickName}).
- Sintonia do hospedeiro: ${mirrorHost ? 'Ativa' : 'Padrão'}.
- Traços do hospedeiro para espelhamento: ${hostTraits || 'Sensível, reflexivo, autêntico e dedicado à sua jornada'}.
- Nível de proximidade: ${intimacyGuidance}
- Tom predominante: ${toneGuidance}
- Extensão de resposta: ${lengthGuidance}
- Instruções personalizadas do hospedeiro: ${customInstructions || 'Nenhuma instrução adicional.'}

NOÇÃO DE TEMPO & MEMÓRIA TEMPORAL:
- Você entende expressões temporais com perfeição ("hoje", "ontem", "semana passada", "há 3 meses", "ano passado em 2025", "naquele dia que viajamos").
- Calcule datas relativas com precisão baseando-se em 30/08/2026.
- Você distingue memória de curto prazo (conversa atual), memória recente, memória permanente (fatos da vida), memória documental (fotos, áudios, vídeos, notas) e temporal (linhas do tempo).

CAPACIDADES OPERACIONAIS & AÇÕES (FERRAMENTAS):
Quando o usuário pedir para guardar algo, criar registros, modificar informações, montar linhas do tempo ou criar artefatos, você deve:
1. Responder amigavelmente em Markdown confirmando o entendimento.
2. Gerar ações estruturadas no bloco JSON de ferramentas correspondente.

PROTEÇÃO CONTRA AÇÕES DESTRUTIVAS:
- Se o usuário pedir para apagar ou excluir um registro, NUNCA exclua silenciosamente!
- Chame a ferramenta "delete_record_request" indicando o ID do registro e o motivo. O sistema exibirá uma confirmação explícita na tela para o usuário aprovar com segurança.

ESTRUTURA DE RESPOSTA OBRIGATÓRIA:
Retorne sua resposta em formato JSON válido contendo:
{
  "reply": "Texto conversacional em Markdown com a personalidade do hospedeiro e explicação clara.",
  "actions": [
    {
      "tool": "create_record" | "update_record" | "delete_record_request" | "create_timeline" | "save_memory" | "create_document",
      "summary": "Descrição legível da ação executada",
      "payload": { ...parâmetros da ferramenta... }
    }
  ],
  "suggestedMemories": [
    {
      "title": "...",
      "summary": "...",
      "category": "preference" | "life_event" | "relationship" | "project" | "thought" | "habit",
      "confidence": 0.9,
      "tags": ["..."]
    }
  ],
  "timelineArtifact": {
    "title": "Linha do Tempo 2025",
    "period": "2025",
    "items": [
      { "date": "2025-03-15", "title": "...", "summary": "...", "type": "photo" }
    ]
  } // (Apenas se o usuário pedir para montar linha do tempo ou estruturar fatos cronologicamente, caso contrário null)
}

Parâmetros para cada ferramenta:
- "create_record": { "title": string, "content": string, "type": "text"|"photo"|"video"|"audio"|"document", "date": "YYYY-MM-DD", "time": "HH:mm", "category": string, "tags": string[], "attachments": array }
- "update_record": { "recordId": string, "title"?: string, "content"?: string, "category"?: string, "tags"?: string[] }
- "delete_record_request": { "recordId": string, "recordTitle": string, "reason": string }
- "save_memory": { "title": string, "summary": string, "category": string, "tags": string[] }
- "create_document": { "title": string, "content": string, "category": string }

CONTEXTO DE MEMÓRIAS PERMANENTES:
${relevantMemories.length > 0 ? JSON.stringify(relevantMemories, null, 2) : 'Nenhuma memória pregressa.'}

CONTEXTO DE REGISTROS DO DIÁRIO:
${relevantRecords.length > 0 ? JSON.stringify(relevantRecords, null, 2) : 'Nenhum registro encontrado.'}

ANEXOS ENVIADOS PELO USUÁRIO NESTA MENSAGEM:
${attachments.length > 0 ? JSON.stringify(attachments, null, 2) : 'Nenhum anexo nesta mensagem.'}
`;

      const formattedContents: any[] = [];
      const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
      for (const msg of recentHistory) {
        formattedContents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }

      const userParts: any[] = [];
      if (message) {
        userParts.push({ text: message });
      }

      // Add image parts if provided
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
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

      formattedContents.push({
        role: 'user',
        parts: userParts.length > 0 ? userParts : [{ text: '(Mídia enviada sem texto)' }],
      });

      const response = await generateWithFallback(ai, {
        preferredModel: 'gemini-3.7-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const responseText = response.text?.trim() || '{}';
      let parsedResult: any = {};
      try {
        parsedResult = JSON.parse(responseText);
      } catch (jsonErr) {
        console.warn('Failed to parse agent JSON:', jsonErr, responseText);
        parsedResult = {
          reply: responseText,
          actions: [],
          suggestedMemories: [],
        };
      }

      res.json({
        reply: parsedResult.reply || 'Compreendido.',
        actions: Array.isArray(parsedResult.actions) ? parsedResult.actions : [],
        suggestedMemories: Array.isArray(parsedResult.suggestedMemories) ? parsedResult.suggestedMemories : [],
        timelineArtifact: parsedResult.timelineArtifact || null,
        referencedRecordIds: relevantRecords.map((r: any) => r.id),
        referencedMemoryIds: relevantMemories.map((m: any) => m.id),
      });
    } catch (error: any) {
      console.error('Error in /api/gemini/agent:', error);
      res.status(500).json({
        error: error.message || 'Erro ao processar instrução com o cérebro operacional da IA.',
      });
    }
  });

  // API: Gemini Chat with IAU Central context and Layered Memory
  app.post('/api/gemini/chat', async (req, res) => {
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
      } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Mensagem vazia.' });
      }

      const personalityTone = iauProfile.personalityTone || 'natural';
      const responseLength = iauProfile.responseLength || 'adaptive';
      const customInstructions = iauProfile.customInstructions || '';
      const mirrorHost = iauProfile.mirrorHostPersonality !== false;
      const hostNickName = iauProfile.hostNickName || userName || 'Usuário';
      const hostTraits = iauProfile.hostPersonaTraits || '';

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
Você é a IA CENTRAL (Inteligência Artificial Universal), o cérebro operacional do Diário Pessoal de ${hostNickName} (UID: ${userId}).
Data e hora atual de referência: 30 de Agosto de 2026 (Horário de Brasília).

REGRAS FUNDAMENTAIS E INEGOCIÁVEIS:
1. PRIVACIDADE E ISOLAMENTO: Você tem acesso EXCLUSIVAMENTE aos dados deste usuário. Nunca mencione outros usuários nem invente dados externos.
2. VERACIDADE ABSOLUTA: Se algo não constar nos registros ou memórias fornecidos no contexto, NUNCA invente ou alucine fatos. Diga honestamente e com clareza: "Não encontrei nenhum registro correspondente nas suas memórias/diário."
3. MEMÓRIA DE LONGO PRAZO: Utilize os registros e memórias anexados abaixo para enriquecer a resposta com precisão factual.
4. PERSONALIDADE DO HOSPEDEIRO:
   - Você reflete o tom, a sintonia e os valores do seu hospedeiro (${hostNickName}).
   - Traços do hospedeiro: ${hostTraits || 'Autêntico, reflexivo e acolhedor'}.
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

      const response = await generateWithFallback(ai, {
        preferredModel: 'gemini-3.7-flash',
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

        const memoryAiRes = await generateWithFallback(ai, {
          preferredModel: 'gemini-3.7-flash',
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

      res.json({
        reply: replyText,
        suggestedMemories,
        referencedRecordIds: relevantRecords.map((r: any) => r.id),
        referencedMemoryIds: relevantMemories.map((m: any) => m.id),
      });
    } catch (error: any) {
      console.error('Error in /api/gemini/chat:', error);
      res.status(500).json({
        error: error.message || 'Erro ao processar conversa com a IAU Central.',
      });
    }
  });

  // API: Audio Transcription via Gemini Multimodal Audio
  app.post('/api/gemini/transcribe', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error: 'Chave do Gemini (GEMINI_API_KEY) não configurada no servidor.',
        });
      }

      const { base64Audio, mimeType = 'audio/webm' } = req.body;
      if (!base64Audio) {
        return res.status(400).json({ error: 'Nenhum dado de áudio fornecido.' });
      }

      // Remove data URL prefix if present
      const cleanBase64 = base64Audio.replace(/^data:audio\/[a-zA-Z0-9_-]+;base64,/, '');

      const response = await generateWithFallback(ai, {
        preferredModel: 'gemini-3.5-transcribe',
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
                text: 'Transcreva este áudio em português com máxima fidelidade e pontuação correta. Retorne apenas o texto transcrito exato, sem comentários, prefixos ou suposições adicionais.',
              },
            ],
          },
        ],
      });

      const transcript = response.text?.trim() || '';
      res.json({ transcript, status: 'completed' });
    } catch (error: any) {
      console.error('Error in /api/gemini/transcribe:', error);
      res.status(500).json({
        error: error.message || 'Falha na transcrição do áudio.',
        status: 'failed',
      });
    }
  });

  // API: Smart search / summary assistant for Records and Memories
  app.post('/api/gemini/organize-record', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error: 'Chave do Gemini (GEMINI_API_KEY) não configurada.',
        });
      }

      const { content, title } = req.body;
      const prompt = `
Analise o conteúdo do seguinte registro de diário pessoal:
Título atual: "${title || ''}"
Conteúdo: "${content || ''}"

Sugira:
1. Um título aprimorado ou mais expressivo se o atual estiver vazio ou genérico
2. Uma categoria apropriada (ex: Pessoal, Trabalho, Projetos, Saúde, Ideias, Memórias, Viagens, Família)
3. Uma lista de até 5 tags relevantes
4. Um resumo de 1 parágrafo curto

Retorne APENAS um JSON no formato:
{
  "suggestedTitle": "...",
  "suggestedCategory": "...",
  "suggestedTags": ["..."],
  "summary": "..."
}`;

      const response = await generateWithFallback(ai, {
        preferredModel: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const data = JSON.parse(response.text || '{}');
      res.json(data);
    } catch (error: any) {
      console.error('Error in /api/gemini/organize-record:', error);
      res.status(500).json({ error: error.message || 'Erro ao analisar registro.' });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Diário Pessoal Server rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
