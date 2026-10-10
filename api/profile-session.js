import { getAuth } from 'firebase-admin/auth';
import { getDb, BOT_COLLECTION } from './lib/firebaseAdmin.js';
import { getOwnedProfileId } from './lib/profileAccess.js';
import { isAdminUser } from './lib/adminAccess.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });

  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Sesi Firebase diperlukan' });

  try {
    const db = getDb();
    const claims = await getAuth().verifyIdToken(match[1], true);
    const { uid } = claims;
    const profileId = await getOwnedProfileId(uid);
    const legacyDoc = await db.collection(BOT_COLLECTION).doc('profiles').get();
    const legacyProfile = legacyDoc.exists
      ? (legacyDoc.data().list || []).find(item => item.id === profileId)
      : null;
    return res.status(200).json({
      profileId,
      isAdmin: isAdminUser(claims),
      profile: legacyProfile ? {
        name: String(legacyProfile.name || '').slice(0, 120),
        photo: typeof legacyProfile.photo === 'string' ? legacyProfile.photo : '',
      } : null,
    });
  } catch (error) {
    console.error('profile-session:', error);
    return res.status(401).json({ error: 'Sesi tidak valid atau layanan akun belum tersedia' });
  }
}
