import { getAuth } from 'firebase-admin/auth';
import { getDb } from './lib/firebaseAdmin.js';
import { codexStorageReady } from './lib/codexScanNota.js';

const ADMIN_EMAIL = 'haripamungkas519@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metode tidak diizinkan.' });

  const bearer = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!bearer) return res.status(401).json({ error: 'Masuk dengan akun admin terlebih dahulu.' });

  try {
    const db = getDb();
    let user;
    try {
      user = await getAuth().verifyIdToken(bearer[1], true);
    } catch {
      return res.status(401).json({ error: 'Sesi admin tidak berlaku. Masuk kembali.' });
    }
    if (user.email?.toLowerCase() !== ADMIN_EMAIL || user.email_verified !== true) {
      return res.status(403).json({ error: 'Akses hanya untuk admin terverifikasi.' });
    }
    const snapshot = await db.collection('server_config').doc('codex_scan_auth').get();
    const stored = !!snapshot.data()?.auth;
    const bootstrap = !!process.env.CODEX_AUTH_JSON_B64;
    const encryption = codexStorageReady();
    return res.status(200).json({
      sessionAvailable: stored || bootstrap,
      encryptionConfigured: encryption,
      claudeFallbackAvailable: !!process.env.ANTHROPIC_API_KEY,
      note: 'Status ini memeriksa konfigurasi, bukan masa berlaku sesi Codex.'
    });
  } catch (error) {
    console.error('admin-codex-status error:', error?.message || error);
    return res.status(500).json({ error: 'Status Codex belum dapat diperiksa.' });
  }
}
