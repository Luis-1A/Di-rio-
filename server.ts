import express from 'express';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = 3000;

// Directory for local persistent storage fallback
const UPLOADS_DIR = path.join(process.cwd(), '.uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[SERVER] Warning creating uploads directory:', e);
}

// In-memory fallback map if disk write fails
const memoryFiles = new Map<string, { fileName: string; mimeType: string; buffer: Buffer }>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not defined in environment.');
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Helper to safely parse JSON from Gemini responses (handles markdown blocks and extra text)
function cleanAndParseJSON(rawText: string): any {
  let text = (rawText || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text);
}

// Sanitize records to keep system prompt light and strip heavy base64 strings
function sanitizeRecordsForPrompt(records: any[]): any[] {
  if (!Array.isArray(records)) return [];
  return records.slice(0, 8).map((r) => ({
    id: r?.id || '',
    title: r?.title || 'Sem título',
    type: r?.type || 'text',
    date: r?.date || '',
    time: r?.time || '',
    category: r?.category || 'geral',
    tags: Array.isArray(r?.tags) ? r.tags.slice(0, 5) : [],
    content: typeof r?.content === 'string' ? r.content.slice(0, 400) : '',
    description: typeof r?.description === 'string' ? r.description.slice(0, 300) : undefined,
    attachments: Array.isArray(r?.attachments)
      ? r.attachments.map((a: any) => ({
          name: a?.name || 'arquivo',
          type: a?.type || 'anexo',
          transcript: typeof a?.transcript === 'string' ? a.transcript.slice(0, 300) : undefined,
        }))
      : [],
  }));
}

// Sanitize memories to keep system prompt light
function sanitizeMemoriesForPrompt(memories: any[]): any[] {
  if (!Array.isArray(memories)) return [];
  return memories.slice(0, 8).map((m) => ({
    id: m?.id || '',
    title: m?.title || '',
    summary: typeof m?.summary === 'string' ? m.summary.slice(0, 300) : '',
    category: m?.category || 'thought',
    tags: Array.isArray(m?.tags) ? m.tags.slice(0, 5) : [],
  }));
}

// Build clean, alternating Gemini conversation contents
function buildGeminiContents(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
  userParts: any[] = []
): any[] {
  const contents: any[] = [];
  const validHistory = (Array.isArray(history) ? history : [])
    .filter(
      (m) =>
        m &&
        m.content &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0 &&
        !m.content.startsWith('Não consegui processar agora:')
    )
    .slice(-8);

  for (const msg of validHistory) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = msg.content.trim();
    if (!text) continue;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push({ text });
    } else {
      contents.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // User parts for the current message
  const finalUserParts: any[] = [];
  if (currentMessage && currentMessage.trim()) {
    finalUserParts.push({ text: currentMessage.trim() });
  }
  if (Array.isArray(userParts) && userParts.length > 0) {
    finalUserParts.push(...userParts);
  }

  if (finalUserParts.length === 0) {
    finalUserParts.push({ text: 'Olá' });
  }

  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts.push(...finalUserParts);
  } else {
    contents.push({
      role: 'user',
      parts: finalUserParts,
    });
  }

  return contents;
}

// Helper with automatic retry on 503 / high demand and fallback to valid modern models
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
    'gemini-flash-latest',
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
        const is503 =
          err?.status === 503 ||
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE');
        if (is503 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Falha ao obter resposta dos modelos Gemini disponíveis.');
}

async function startServer() {
  const app = express();

  // Global middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Dedicated API Router for all server-side endpoints
  const apiRouter = express.Router();

  // Raw binary middleware for high-speed direct binary video and media upload (up to 300MB)
  const rawBinaryParser = express.raw({
    type: () => true,
    limit: '300mb',
  });
  apiRouter.use('/media/upload-binary', rawBinaryParser);
  apiRouter.use('/upload-binary', rawBinaryParser);

  // API Health Check
  apiRouter.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Diário Pessoal API',
      timestamp: new Date().toISOString(),
    });
  });

  // Helper function to stream file or buffer with full HTTP Range (206 Partial Content) support
  const handleStreamResponse = async (
    req: express.Request,
    res: express.Response,
    fileId: string,
    forceBinaryDownload: boolean = false
  ) => {
    try {
      // 1. Check in-memory files
      const memFile = memoryFiles.get(fileId);
      if (memFile) {
        const buffer = memFile.buffer;
        const totalSize = buffer.length;
        const mimeType = forceBinaryDownload ? 'application/octet-stream' : memFile.mimeType;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Disposition',
          `${forceBinaryDownload ? 'attachment' : 'inline'}; filename="${memFile.fileName}"`
        );
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const range = req.headers.range;
        if (range && !forceBinaryDownload) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': chunkSize,
          });
          return res.end(buffer.subarray(start, end + 1));
        }

        res.setHeader('Content-Length', totalSize);
        return res.end(buffer);
      }

      // 2. Check disk files (match by exact fileId or prefix in UPLOADS_DIR)
      let matchedFilePath: string | null = null;
      let matchedFileName = `video_${fileId}.mp4`;
      let matchedMime = 'video/mp4';

      const metaPath = path.join(UPLOADS_DIR, `${fileId}.meta.json`);
      if (fs.existsSync(metaPath)) {
        try {
          const metaRaw = await fsp.readFile(metaPath, 'utf-8');
          const meta = JSON.parse(metaRaw);
          matchedFileName = meta.fileName || matchedFileName;
          matchedMime = meta.mimeType || matchedMime;
          const candidatePath = path.join(UPLOADS_DIR, `${fileId}_${meta.fileName}`);
          if (fs.existsSync(candidatePath)) {
            matchedFilePath = candidatePath;
          }
        } catch (e) {}
      }

      if (!matchedFilePath) {
        // Search files in directory starting with fileId
        try {
          const dirFiles = await fsp.readdir(UPLOADS_DIR);
          const found = dirFiles.find((f) => f.startsWith(fileId) && !f.endsWith('.meta.json'));
          if (found) {
            matchedFilePath = path.join(UPLOADS_DIR, found);
            matchedFileName = found.replace(new RegExp(`^${fileId}_?`), '');
            if (matchedFileName.endsWith('.mp4')) matchedMime = 'video/mp4';
            else if (matchedFileName.endsWith('.webm')) matchedMime = 'video/webm';
            else if (matchedFileName.endsWith('.png')) matchedMime = 'image/png';
            else if (matchedFileName.endsWith('.jpg') || matchedFileName.endsWith('.jpeg')) matchedMime = 'image/jpeg';
            else if (matchedFileName.endsWith('.pdf')) matchedMime = 'application/pdf';
          }
        } catch (e) {}
      }

      if (matchedFilePath && fs.existsSync(matchedFilePath)) {
        const stat = await fsp.stat(matchedFilePath);
        const totalSize = stat.size;
        const mimeType = forceBinaryDownload ? 'application/octet-stream' : matchedMime;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Disposition',
          `${forceBinaryDownload ? 'attachment' : 'inline'}; filename="${matchedFileName}"`
        );
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const range = req.headers.range;
        if (range && !forceBinaryDownload) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': chunkSize,
          });
          const stream = fs.createReadStream(matchedFilePath, { start, end });
          return stream.pipe(res);
        }

        res.setHeader('Content-Length', totalSize);
        return fs.createReadStream(matchedFilePath).pipe(res);
      }

      return res.status(404).json({ error: 'Arquivo binário não encontrado no servidor.' });
    } catch (err: any) {
      console.error('[STREAM RESPONSE ERROR]', err);
      return res.status(500).send('Erro na transmissão binária.');
    }
  };

  // API: Raw Binary Video/Media Upload (Direct stream from device to server disk/memory - 0 base64 overhead)
  const handleBinaryUpload = async (req: express.Request, res: express.Response) => {
    try {
      const rawHeaderName = (req.headers['x-file-name'] as string) || '';
      let cleanFileName = 'video.mp4';
      try {
        cleanFileName = decodeURIComponent(rawHeaderName).replace(/[^a-zA-Z0-9._-]/g, '_');
      } catch {
        cleanFileName = rawHeaderName.replace(/[^a-zA-Z0-9._-]/g, '_') || `video_${Date.now()}.mp4`;
      }
      if (!cleanFileName || cleanFileName === '_') {
        cleanFileName = `video_${Date.now()}.mp4`;
      }

      const mimeType = (req.headers['x-mime-type'] as string) || (req.headers['content-type'] as string) || 'video/mp4';
      const recordId = (req.headers['x-record-id'] as string) || `rec_${Date.now()}`;
      const userId = (req.headers['x-user-id'] as string) || 'user';
      const category = (req.headers['x-category'] as string) || 'videos';
      const fileId = recordId || `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const targetFilePath = path.join(UPLOADS_DIR, `${fileId}_${cleanFileName}`);
      const metaFilePath = path.join(UPLOADS_DIR, `${fileId}.meta.json`);

      // If body was already parsed as Buffer
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        const fileBuffer = req.body;
        await fsp.writeFile(targetFilePath, fileBuffer);
        await fsp.writeFile(
          metaFilePath,
          JSON.stringify({
            fileId,
            fileName: cleanFileName,
            mimeType,
            fileSize: fileBuffer.length,
            userId,
            recordId,
            category,
            uploadedAt: new Date().toISOString(),
          }, null, 2)
        );

        if (fileBuffer.length < 35 * 1024 * 1024) {
          memoryFiles.set(fileId, {
            fileName: cleanFileName,
            mimeType,
            buffer: fileBuffer,
          });
        }

        console.log(`[BINARY UPLOAD] Vídeo binário salvo com sucesso (${fileBuffer.length} bytes): ${cleanFileName}`);

        return res.json({
          success: true,
          fileId,
          url: `/api/media/stream/${fileId}`,
          streamUrl: `/api/media/stream/${fileId}`,
          binaryUrl: `/api/media/binary/${fileId}`,
          fileName: cleanFileName,
          fileSize: fileBuffer.length,
          mimeType,
          mode: 'binary',
        });
      }

      // Otherwise, pipe raw stream directly to disk write stream
      const writeStream = fs.createWriteStream(targetFilePath);
      const memoryChunks: Buffer[] = [];
      let totalBytes = 0;

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes < 35 * 1024 * 1024) {
          memoryChunks.push(chunk);
        }
      });

      req.pipe(writeStream);

      writeStream.on('finish', async () => {
        try {
          await fsp.writeFile(
            metaFilePath,
            JSON.stringify({
              fileId,
              fileName: cleanFileName,
              mimeType,
              fileSize: totalBytes,
              userId,
              recordId,
              category,
              uploadedAt: new Date().toISOString(),
            }, null, 2)
          );

          if (memoryChunks.length > 0 && totalBytes < 35 * 1024 * 1024) {
            memoryFiles.set(fileId, {
              fileName: cleanFileName,
              mimeType,
              buffer: Buffer.concat(memoryChunks),
            });
          }

          console.log(`[BINARY STREAM UPLOAD] Vídeo gravado em binário (${totalBytes} bytes): ${cleanFileName}`);

          res.json({
            success: true,
            fileId,
            url: `/api/media/stream/${fileId}`,
            streamUrl: `/api/media/stream/${fileId}`,
            binaryUrl: `/api/media/binary/${fileId}`,
            fileName: cleanFileName,
            fileSize: totalBytes,
            mimeType,
            mode: 'binary_stream',
          });
        } catch (postErr) {
          console.error('[POST STREAM ERROR]', postErr);
          res.json({
            success: true,
            fileId,
            url: `/api/media/stream/${fileId}`,
            streamUrl: `/api/media/stream/${fileId}`,
            binaryUrl: `/api/media/binary/${fileId}`,
            fileName: cleanFileName,
            fileSize: totalBytes,
            mimeType,
          });
        }
      });

      writeStream.on('error', (err) => {
        console.error('[BINARY WRITE STREAM ERROR]', err);
        res.status(500).json({ error: 'Erro ao gravar binário no disco do servidor.' });
      });
    } catch (err: any) {
      console.error('[HANDLE BINARY UPLOAD ERROR]', err);
      res.status(500).json({ error: err.message || 'Falha no upload binário.' });
    }
  };

  // Mount Binary Upload Endpoints
  apiRouter.post('/media/upload-binary', handleBinaryUpload);
  apiRouter.post('/upload-binary', handleBinaryUpload);

  // Mount Video Range Streaming Endpoints (Supports byte ranges, seek, fast start)
  apiRouter.get('/media/stream/:fileId', (req, res) => {
    handleStreamResponse(req, res, req.params.fileId, false);
  });

  // Proxy endpoint for remote media (e.g. Firebase Storage) to bypass CORS and stream with byte range support
  apiRouter.get('/media/proxy', async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl || !rawUrl.startsWith('http')) {
        return res.status(400).json({ error: 'URL inválida para proxy' });
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

      const headers: Record<string, string> = {};
      if (req.headers.range) {
        headers['range'] = req.headers.range;
      }

      const upstream = await fetch(rawUrl, { headers });
      res.status(upstream.status);

      const contentType = upstream.headers.get('content-type') || 'video/mp4';
      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', acceptRanges);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);

      if (upstream.body) {
        // Node 18+ Web Streams to Node Response
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
        return res.end();
      } else {
        return res.end();
      }
    } catch (err: any) {
      console.error('[MEDIA PROXY ERROR]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Falha ao transmitir mídia via proxy' });
      }
    }
  });

  // Mount Direct Binary Download Endpoint (Returns raw application/octet-stream)
  apiRouter.get('/media/binary/:fileId', (req, res) => {
    handleStreamResponse(req, res, req.params.fileId, true);
  });

  // Legacy & general file streaming
  apiRouter.get('/files/:fileId', (req, res) => {
    handleStreamResponse(req, res, req.params.fileId, false);
  });

  // API: Robust File Upload (Fallback for JSON base64 payloads)
  apiRouter.post('/upload', async (req, res) => {
    try {
      const { fileName, mimeType, dataBase64, userId, recordId } = req.body;
      if (!dataBase64) {
        return res.status(400).json({ error: 'Nenhum dado de arquivo fornecido.' });
      }

      const cleanFileName = (fileName || `arquivo_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeMimeType = mimeType || 'application/octet-stream';
      const fileId = recordId || `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Decode base64 payload into binary Buffer
      const pureBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(pureBase64, 'base64');
      const fileSize = fileBuffer.length;

      // Persist to disk as pure binary
      let savedToDisk = false;
      const targetFilePath = path.join(UPLOADS_DIR, `${fileId}_${cleanFileName}`);
      const metaFilePath = path.join(UPLOADS_DIR, `${fileId}.meta.json`);

      try {
        await fsp.writeFile(targetFilePath, fileBuffer);
        await fsp.writeFile(
          metaFilePath,
          JSON.stringify({
            fileId,
            fileName: cleanFileName,
            mimeType: safeMimeType,
            fileSize,
            userId,
            recordId,
            createdAt: new Date().toISOString(),
          }, null, 2)
        );
        savedToDisk = true;
      } catch (fsErr) {
        console.warn('[SERVER UPLOAD] Disk save warning, falling back to memory cache:', fsErr);
      }

      // Always keep in memory cache for instantaneous response
      memoryFiles.set(fileId, {
        fileName: cleanFileName,
        mimeType: safeMimeType,
        buffer: fileBuffer,
      });

      const fileServingUrl = `/api/media/stream/${fileId}`;
      console.log(
        `[SERVER UPLOAD] Arquivo salvo em binário (${savedToDisk ? 'disco+memória' : 'memória'}): ${cleanFileName} (${safeMimeType}, ${fileSize} bytes) -> ${fileServingUrl}`
      );

      res.json({
        success: true,
        fileId,
        url: fileServingUrl,
        streamUrl: fileServingUrl,
        binaryUrl: `/api/media/binary/${fileId}`,
        fileName: cleanFileName,
        fileSize,
        mimeType: safeMimeType,
        confirmedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[SERVER UPLOAD ERROR]', err);
      res.status(500).json({ error: err.message || 'Falha no upload do servidor.' });
    }
  });

  // API: Real-Time Streaming IAU Chat (Zero latency, live progressive tokens)
  apiRouter.post('/gemini/stream', async (req, res) => {
    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.write(
          `data: ${JSON.stringify({
            error: 'Chave do Gemini (GEMINI_API_KEY) não configurada no servidor.',
            done: true,
          })}\n\n`
        );
        return res.end();
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
        requestId = `req_${Date.now()}`,
      } = req.body;

      if (!message && (!attachments || attachments.length === 0)) {
        res.write(`data: ${JSON.stringify({ error: 'Mensagem vazia.', done: true })}\n\n`);
        return res.end();
      }

      const personalityTone = iauProfile.personalityTone || 'natural';
      const responseLength = iauProfile.responseLength || 'adaptive';
      const customInstructions = iauProfile.customInstructions || '';
      const hostNickName = iauProfile.hostNickName || userName || 'amigo';
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
Você é a IAU (Inteligência Artificial Universal), a mente central, guardiã e companheira de inteligência viva no Diário Pessoal de ${hostNickName} (UID: ${userId}).
Data e hora atual de referência: 31 de Agosto de 2026, às ${currentTimeStr} (Horário de Brasília).

SUA ESSÊNCIA E PERSONALIDADE:
- Você é uma IA conversacional extraordinariamente inteligente, calorosa, empática, perspicaz, articulada e amigável (no mesmo nível ou superior aos melhores modelos de linguagem mundiais como ChatGPT e Gemini).
- Você NUNCA dá respostas frias, burocráticas ou robóticas. Você conversa como um verdadeiro amigo e mentor brilhante.
- Sabe ouvir com profunda sensibilidade psicológica, brincar quando o momento é descontraído, apoiar com carinho nos momentos difíceis e raciocinar com precisão cirúrgica quando solicitada.
- Possui domínio magistral em Matemática, Ciências, Lógica, Filosofia, Programação, História, Literatura e Língua Portuguesa. Sabe explicar conceitos complexos com metáforas simples e claras, ou resolver problemas matemáticos complexos passo a passo com didática impecável.
- Quando o usuário te ensinar algo ("quando eu disser X, significa Y" ou "meu projeto se chama Z"), assimile imediatamente essa regra/fato e faça referências inteligentes a ela.
- Se o usuário pedir para ser testado ou desafiado ("me testa", "faz um quiz"), crie perguntas estimulantes e interativas.

DIRETRIZES DE ESTILO:
- Nível de proximidade: ${intimacyGuidance}
- Tom da conversa: ${toneGuidance}
- Extensão e ritmo: ${lengthGuidance}
- Traços do hospedeiro: ${hostTraits || 'Autêntico, curioso e reflexivo'}.
${customInstructions ? `Instruções personalizadas do usuário: ${customInstructions}` : ''}

CONTEXTO DE MEMÓRIAS DO USUÁRIO:
${cleanMemories.length > 0 ? JSON.stringify(cleanMemories, null, 2) : 'Nenhuma memória pregressa indexada para esta mensagem específica.'}

CONTEXTO DE REGISTROS DO DIÁRIO:
${cleanRecords.length > 0 ? JSON.stringify(cleanRecords, null, 2) : 'Nenhum registro específico retornado para esta consulta.'}

Responda em Markdown elegante e natural, com formatação harmoniosa, sem rodeios artificiais e com total fluidez humana.
`;

      const userParts: any[] = [];
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

      const formattedContents = buildGeminiContents(history, message, userParts);

      // Call streaming Gemini API directly
      const candidateModels = [
        'gemini-3.7-flash',
        'gemini-flash-latest',
        'gemini-3.1-flash-lite',
      ];
      let streamStarted = false;

      for (const model of candidateModels) {
        try {
          const responseStream = await ai.models.generateContentStream({
            model,
            contents: formattedContents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          streamStarted = true;

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              res.write(
                `data: ${JSON.stringify({
                  requestId,
                  text,
                  done: false,
                })}\n\n`
              );
            }
          }

          res.write(
            `data: ${JSON.stringify({
              requestId,
              done: true,
              referencedRecordIds: relevantRecords.map((r: any) => r.id),
              referencedMemoryIds: relevantMemories.map((m: any) => m.id),
            })}\n\n`
          );
          return res.end();
        } catch (streamErr: any) {
          if (streamStarted) {
            // If already started streaming chunks to client, close stream cleanly
            res.write(
              `data: ${JSON.stringify({
                requestId,
                done: true,
              })}\n\n`
            );
            return res.end();
          }
          // Try next model if stream hasn't sent any chunk
        }
      }

      // If all models failed or hit quota, signal clean fallback
      res.write(
        `data: ${JSON.stringify({
          requestId,
          fallbackRequired: true,
          error: 'RATE_LIMIT_FALLBACK',
          done: true,
        })}\n\n`
      );
      res.end();
    } catch (err: any) {
      console.error('[STREAM ERROR]', err);
      res.write(
        `data: ${JSON.stringify({
          error: err?.message || 'Erro inesperado na geração da IA.',
          done: true,
        })}\n\n`
      );
      res.end();
    }
  });

  // API: Gemini Central Agent (Brain of the Personal Diary)
  apiRouter.post('/gemini/agent', async (req, res) => {
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

      const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

      const cleanMemories = sanitizeMemoriesForPrompt(relevantMemories);
      const cleanRecords = sanitizeRecordsForPrompt(relevantRecords);

      const systemInstruction = `
Você é a IAU (Inteligência Artificial Universal), a mente central, conselheira e companheira de vida no Diário Pessoal de ${hostNickName} (UID: ${userId}).
Data e hora atual de referência: 30 de Agosto de 2026, às ${currentTimeStr} (Horário de Brasília).

FILOSOFIA E PERSONALIDADE:
- Sua personalidade é calorosa, amigável, natural, viva, divertida e levemente sarcástica (com humor refinado, perspicaz e inteligente, sem jamais ser rude, fria ou desrespeitosa).
- Você conversa de igual para igual, como uma confidente fiel e perspicaz que acompanha a vida de ${hostNickName}.
- Para cumprimentos e saudações do dia a dia (como "Oi", "Olá", "E aí", "Tudo bem?"): responda de forma leve, simpática e descontraída, demonstrando prontidão para ouvir o que aconteceu, registrar momentos ou bater um papo.
- Se o usuário falar de assuntos sérios, desabafos ou momentos difíceis, seja profundamente empática, acolhedora e atenciosa.
- Traços do hospedeiro: ${hostTraits || 'Autêntico, reflexivo e dedicado à sua evolução pessoal'}.
- Nível de proximidade: ${intimacyGuidance}
- Tom predominante: ${toneGuidance}
- Extensão de resposta: ${lengthGuidance}
- Instruções adicionais do usuário: ${customInstructions || 'Nenhuma instrução adicional.'}

CAPACIDADES OPERACIONAIS DO DIÁRIO (FERRAMENTAS):
Quando o usuário pedir explicitamente para criar registro, salvar fotos/áudios, modificar notas, montar linha do tempo ou guardar memórias, responda com carinho e forneça a ação estruturada no JSON:
- "create_record": criar registro (texto, foto, áudio, vídeo, documento)
- "update_record": alterar registro existente
- "delete_record_request": solicitação de exclusão (sempre requer aprovação visual)
- "save_memory": registrar fato permanente importante
- "create_document": gerar documento estruturado
- "create_timeline": organizar fatos cronologicamente

ESTRUTURA DE RESPOSTA OBRIGATÓRIA (JSON VÁLIDO):
{
  "reply": "Sua resposta conversacional em Markdown, natural, viva, com o tom da IAU.",
  "actions": [],
  "suggestedMemories": [],
  "timelineArtifact": null
}

CONTEXTO DE MEMÓRIAS PERMANENTES:
${cleanMemories.length > 0 ? JSON.stringify(cleanMemories, null, 2) : 'Nenhuma memória pregressa relevante.'}

CONTEXTO DE REGISTROS DO DIÁRIO:
${cleanRecords.length > 0 ? JSON.stringify(cleanRecords, null, 2) : 'Nenhum registro encontrado para este contexto.'}

ANEXOS ENVIADOS NESTA MENSAGEM:
${attachments.length > 0 ? JSON.stringify(attachments.map((a: any) => ({ name: a.name, type: a.type, mimeType: a.mimeType })), null, 2) : 'Nenhum anexo nesta mensagem.'}
`;

      const userParts: any[] = [];
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

      const formattedContents = buildGeminiContents(history, message, userParts);

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
        parsedResult = cleanAndParseJSON(responseText);
      } catch (jsonErr) {
        console.warn('Failed to parse agent JSON, falling back to raw text reply:', jsonErr);
        parsedResult = {
          reply: responseText,
          actions: [],
          suggestedMemories: [],
        };
      }

      res.json({
        reply: parsedResult.reply || 'Compreendido! Como posso ajudar você agora?',
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
  apiRouter.post('/gemini/chat', async (req, res) => {
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

      const cleanMemories = sanitizeMemoriesForPrompt(relevantMemories);
      const cleanRecords = sanitizeRecordsForPrompt(relevantRecords);

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
${cleanMemories.length > 0 ? JSON.stringify(cleanMemories, null, 2) : 'Nenhuma memória pregressa indexada para esta consulta específica.'}

CONTEXTO DE REGISTROS RELEVANTES DO DIÁRIO (incluindo notas, fotos, documentos e transcrições de áudios):
${cleanRecords.length > 0 ? JSON.stringify(cleanRecords, null, 2) : 'Nenhum registro específico retornado para esta consulta.'}
`;

      // Build conversation contents cleanly
      const formattedContents = buildGeminiContents(history, message);

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
  apiRouter.post('/gemini/transcribe', async (req, res) => {
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
        preferredModel: 'gemini-3.7-flash',
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
  apiRouter.post('/gemini/organize-record', async (req, res) => {
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

  // Strict API 404 handler inside apiRouter - guarantees any unhandled /api/* returns JSON, never HTML
  apiRouter.use((req, res) => {
    console.warn(`[SERVER 404] API route not found: ${req.method} /api${req.url}`);
    res.status(404).json({
      error: `Endpoint de API não encontrado: ${req.method} /api${req.url}`,
      status: 404,
    });
  });

  // API Error handler inside apiRouter
  apiRouter.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API INTERNAL ERROR]', err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro interno no servidor de API.',
        status: err?.status || 500,
      });
    }
  });

  // Mount API router FIRST before any Vite or static asset middlewares
  app.use('/api', apiRouter);

  // Vite middleware setup (development) / Static files (production)
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
