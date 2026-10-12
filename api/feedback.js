import { getAuth } from 'firebase-admin/auth';
import { getDb } from './lib/firebaseAdmin.js';

const TYPES = { saran: 'Saran', masalah: 'Laporan masalah', lainnya: 'Masukan lainnya' };
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan.' });

  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Masuk dengan akun Google atau email untuk mengirim masukan.' });

  const type = req.body?.type;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!Object.hasOwn(TYPES, type) || message.length < 10 || message.length > 2000) {
    return res.status(400).json({ error: 'Pilih jenis masukan dan tulis 10–2000 karakter.' });
  }
  if (req.body?.website) return res.status(200).json({ ok: true });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  const to = process.env.FEEDBACK_TO_EMAIL || 'admin@myfinanceapp.my.id';
  if (!apiKey || !from) {
    return res.status(503).json({ error: 'Pengiriman email masukan belum aktif. Admin perlu mengatur Resend di Vercel.' });
  }

  try {
    const db = getDb();
    let user;
    try {
      user = await getAuth().verifyIdToken(match[1], true);
    } catch {
      return res.status(401).json({ error: 'Sesi tidak berlaku. Masuk kembali lalu ulangi.' });
    }

    const limitRef = db.collection('feedback_rate_limits').doc(user.uid);
    const now = Date.now();
    let limited = false;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(limitRef);
      const prior = snapshot.data() || {};
      const windowStart = Number(prior.windowStart) || 0;
      const sameWindow = now - windowStart < WINDOW_MS;
      const count = sameWindow ? Number(prior.count) || 0 : 0;
      if (count >= MAX_PER_WINDOW) { limited = true; return; }
      transaction.set(limitRef, { count: count + 1, windowStart: sameWindow ? windowStart : now });
    });
    if (limited) return res.status(429).json({ error: 'Terlalu banyak masukan. Coba lagi dalam satu jam.' });

    const senderName = user.name || user.email || 'Pengguna MyFinanceApp';
    const senderEmail = user.email || '';
    const body = [
      `Jenis: ${TYPES[type]}`,
      `Nama: ${senderName}`,
      `Email: ${senderEmail || 'Tidak tersedia'}`,
      `UID: ${user.uid}`,
      '',
      'Pesan:',
      message
    ].join('\n');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[MyFinanceApp] ${TYPES[type]} dari pengguna`,
        text: body,
        ...(senderEmail ? { reply_to: senderEmail } : {})
      }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) {
      console.error('feedback email failed:', response.status, result?.name || result?.message || 'unknown');
      return res.status(502).json({ error: 'Email belum berhasil dikirim. Coba lagi nanti.' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('feedback error:', error);
    return res.status(500).json({ error: 'Masukan belum dapat dikirim. Coba lagi nanti.' });
  }
}
