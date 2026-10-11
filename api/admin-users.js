import { getAuth } from 'firebase-admin/auth';
import { getDb } from './lib/firebaseAdmin.js';

const ADMIN_EMAIL = 'haripamungkas519@gmail.com';
const PAGE_SIZE = 50;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan.' });

  const authorization = req.headers.authorization || '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return res.status(401).json({ error: 'Masuk dengan akun Google admin terlebih dahulu.' });

  try {
    // Firebase Admin diinisialisasi lewat konfigurasi server yang sudah digunakan API lain.
    getDb();
    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(match[1], true);
    } catch {
      return res.status(401).json({ error: 'Sesi sudah tidak berlaku. Masuk kembali.' });
    }
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL || decoded.email_verified !== true) {
      return res.status(403).json({ error: 'Akses hanya untuk akun admin terverifikasi.' });
    }

    const pageToken = req.body?.pageToken;
    if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 4096)) {
      return res.status(400).json({ error: 'Penanda halaman tidak valid.' });
    }

    const [page, total] = await Promise.all([
      auth.listUsers(PAGE_SIZE, pageToken || undefined),
      countUsers(auth),
    ]);
    const users = page.users.map(user => ({
      uid: user.uid,
      name: user.displayName || '',
      email: user.email || '',
      verified: user.emailVerified,
      disabled: user.disabled,
      createdAt: user.metadata.creationTime || '',
      lastSignInAt: user.metadata.lastSignInTime || '',
      providers: user.providerData.map(provider => provider.providerId),
    }));
    return res.status(200).json({ total, users, nextPageToken: page.pageToken || null });
  } catch (error) {
    console.error('admin-users error:', error);
    return res.status(500).json({ error: 'Daftar pengguna belum dapat dimuat. Coba lagi nanti.' });
  }
}

async function countUsers(auth) {
  let total = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return total;
}
