import { createHash } from 'node:crypto';
import { getDb, BOT_COLLECTION } from './lib/_firebaseAdmin.js';
import { requireUser } from './lib/_requireUser.js';

export async function claimLegacyProfile(db, uid, code, now = Date.now()) {
  const hash = createHash('sha256').update(code).digest('hex');
  const inviteRef = db.collection('legacy_invites').doc(hash);
  const mappingRef = db.collection(BOT_COLLECTION).doc('uid_mappings');
  return db.runTransaction(async transaction => {
    const [inviteDoc, mappingDoc] = await Promise.all([
      transaction.get(inviteRef), transaction.get(mappingRef),
    ]);
    const invite = inviteDoc.exists ? inviteDoc.data() : null;
    if (!invite || invite.usedBy || invite.expiresAt <= now) {
      throw new Error('Kode pemulihan tidak berlaku atau sudah dipakai');
    }
    const target = invite.profileId;
    const mappings = mappingDoc.exists ? mappingDoc.data() : {};
    if (mappings[uid] && mappings[uid] !== target) {
      throw new Error('Akun ini sudah terhubung ke profil lain');
    }
    if (Object.entries(mappings).some(([otherUid, mapped]) => otherUid !== uid && mapped === target)) {
      throw new Error('Profil lama sudah terhubung ke akun lain');
    }
    if (uid !== target) {
      const collections = ['transactions', 'savings', 'goals', 'ai_chat'];
      const snapshots = await Promise.all(collections.map(name =>
        transaction.get(db.collection(BOT_COLLECTION).doc(uid).collection(name).limit(1))
      ));
      if (snapshots.some(snapshot => !snapshot.empty)) {
        throw new Error('Akun ini sudah punya data. Hubungi admin agar data tidak tertimpa');
      }
    }
    transaction.set(mappingRef, { [uid]: target }, { merge: true });
    transaction.update(inviteRef, { usedBy: uid, usedAt: now });
    return target;
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });

  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Sesi Firebase diperlukan' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Sesi Firebase tidak valid' });
  const code = String(req.body?.code || '').trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(code)) return res.status(400).json({ error: 'Format kode pemulihan tidak valid' });

  try {
    const db = getDb();
    const { uid } = user;
    const profileId = await claimLegacyProfile(db, uid, code);
    return res.status(200).json({ profileId });
  } catch (error) {
    if (error.message?.includes('Kode') || error.message?.includes('Akun ini') || error.message?.includes('Profil lama')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('claim-legacy:', error);
    return res.status(500).json({ error: 'Pemulihan belum bisa diproses' });
  }
}
