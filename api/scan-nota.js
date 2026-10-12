// Endpoint scan-nota — delegasi ke _lib/scanNota.js (logika Vision dibagi dengan webhook Telegram).
import { extractNota } from './lib/scanNota.js';
import { startCodexDeviceLogin } from './lib/_codexDeviceLogin.js';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './lib/firebaseAdmin.js';

// Vision calls may need longer than Vercel's legacy Hobby default of 10 seconds.
export const config = { maxDuration: 300 };
const ADMIN_EMAIL = 'haripamungkas519@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const bearer = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!bearer) return res.status(401).json({ error: 'Scan nota memerlukan sesi akun aplikasi dengan email atau Google. Hubungkan akun Google di Pengaturan jika Anda memakai username lama.' });
  let user;
  try {
    getDb();
    user = await getAuth().verifyIdToken(bearer[1], true);
  } catch (_) {
    return res.status(401).json({ error: 'Sesi tidak berlaku. Masuk kembali sebelum scan nota.' });
  }

  if (req.body?.action === 'codex-login') {
    if (user.email?.toLowerCase() !== ADMIN_EMAIL || user.email_verified !== true) {
      return res.status(403).json({ error: 'Login Codex hanya tersedia untuk admin terverifikasi.' });
    }
    try {
      return await startCodexDeviceLogin(res);
    } catch (error) {
      return res.status(503).json({ error: error.message || 'Login Codex belum bisa dimulai.' });
    }
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 tidak ada di request' });

    const providerConfig = { anthropicApiKey: process.env.ANTHROPIC_API_KEY };

    try {
      const result = await extractNota(providerConfig, imageBase64, mimeType);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  } catch (err) {
    console.error('Fatal Handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
