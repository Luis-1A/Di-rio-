import type { Request, Response } from 'express';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  return res.status(200).json({
    status: 'ok',
    geminiConfigured: hasGeminiKey,
    environment: process.env.VERCEL ? 'vercel' : 'node',
    timestamp: new Date().toISOString(),
  });
}
