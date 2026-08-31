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

    const { base64Audio, mimeType = 'audio/webm' } = req.body || {};
    if (!base64Audio) {
      return res.status(400).json({ error: 'Nenhum dado de áudio fornecido.' });
    }

    const cleanBase64 = base64Audio.replace(/^data:audio\/[a-zA-Z0-9_-]+;base64,/, '');

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
              text: 'Transcreva este áudio em português com máxima fidelidade e pontuação correta. Retorne apenas o texto transcrito exato, sem comentários, prefixos ou suposições adicionais.',
            },
          ],
        },
      ],
    });

    const transcript = response.text?.trim() || '';
    return res.status(200).json({ transcript, status: 'completed' });
  } catch (error: any) {
    console.error('Error in Vercel /api/gemini/transcribe:', error);
    return res.status(500).json({
      error: error.message || 'Falha na transcrição do áudio.',
      status: 'failed',
    });
  }
}
