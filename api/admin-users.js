import { getAuth } from 'firebase-admin/auth';
import { getDb, BOT_COLLECTION } from './lib/_firebaseAdmin.js';
import { requireUser } from './lib/_requireUser.js';
import { isAdminUser } from './lib/_adminAccess.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metode tidak didukung' });

  const claims = await requireUser(req);
  if (!claims) return res.status(401).json({ error: 'Masuk dengan Google terlebih dahulu' });
  if (!isAdminUser(claims)) return res.status(403).json({ error: 'Hanya admin yang dapat membuka daftar pengguna' });

  try {
    const db = getDb();
    const cursor = typeof req.query?.cursor === 'string' ? req.query.cursor : undefined;
    const [usersPage, mappingDoc, legacyDoc] = await Promise.all([
      getAuth().listUsers(1000, cursor),
      db.collection(BOT_COLLECTION).doc('uid_mappings').get(),
      db.collection(BOT_COLLECTION).doc('profiles').get(),
    ]);
    const mapping = mappingDoc.exists ? mappingDoc.data() : {};
    const legacyProfiles = legacyDoc.exists ? (legacyDoc.data().list || []) : [];
    const legacyById = new Map(legacyProfiles.map(profile => [profile.id, profile]));
    const users = usersPage.users.map(user => {
      const profileId = mapping[user.uid] || user.uid;
      return {
        uid: user.uid,
        profileId,
        name: user.displayName || legacyById.get(profileId)?.name || '',
        email: user.email || '',
        emailVerified: Boolean(user.emailVerified),
        providers: user.providerData.map(provider => provider.providerId),
        createdAt: user.metadata.creationTime || null,
        lastSignInAt: user.metadata.lastSignInTime || null,
        status: 'Firebase',
      };
    });
    if (!cursor) {
      const linkedProfiles = new Set(Object.values(mapping));
      const firebaseUids = new Set(usersPage.users.map(user => user.uid));
      users.push(...legacyProfiles.filter(profile => !linkedProfiles.has(profile.id) && !firebaseUids.has(profile.id)).map(profile => ({
        uid: null, profileId: profile.id, name: profile.name || '', email: '',
        emailVerified: false, providers: [], createdAt: null,
        lastSignInAt: null, status: 'Perlu migrasi',
      })));
    }
    return res.status(200).json({ users, nextCursor: usersPage.pageToken || null });
  } catch (error) {
    console.error('admin-users:', error);
    return res.status(500).json({ error: 'Daftar pengguna belum dapat dimuat' });
  }
}
