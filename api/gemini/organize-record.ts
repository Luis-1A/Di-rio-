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
        error: 'Chave do Gemini (GEMINI_API_KEY) não configurada.',
      });
    }

    const { content, title } = req.body || {};
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const data = JSON.parse(response.text || '{}');
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error in Vercel /api/gemini/organize-record:', error);
    return res.status(500).json({ error: error.message || 'Erro ao analisar registro.' });
  }
}
