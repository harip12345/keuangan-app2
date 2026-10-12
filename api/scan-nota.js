// Endpoint scan-nota — delegasi ke _lib/scanNota.js (logika Vision dibagi dengan webhook Telegram).
import { extractNota } from './lib/scanNota.js';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './lib/firebaseAdmin.js';

// Vision calls may need longer than Vercel's legacy Hobby default of 10 seconds.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const bearer = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!bearer) return res.status(401).json({ error: 'Masuk dengan akun email atau Google untuk scan nota.' });
  try {
    getDb();
    await getAuth().verifyIdToken(bearer[1]);
  } catch (_) {
    return res.status(401).json({ error: 'Sesi tidak berlaku. Masuk kembali sebelum scan nota.' });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 tidak ada di request' });

    const anthropicConfig = { apiKey: process.env.ANTHROPIC_API_KEY };
    if (!anthropicConfig.apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diatur di Vercel.' });
    }

    try {
      const result = await extractNota(anthropicConfig, imageBase64, mimeType);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  } catch (err) {
    console.error('Fatal Handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
