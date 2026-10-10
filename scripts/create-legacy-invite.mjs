import { createHash, randomBytes } from 'node:crypto';
import { getDb, BOT_COLLECTION } from '../api/lib/_firebaseAdmin.js';

const profileId = process.argv[2];
if (!profileId || !/^[A-Za-z0-9_-]{2,128}$/.test(profileId)) {
  console.error('Pemakaian: node scripts/create-legacy-invite.mjs <profileId>');
  process.exit(1);
}

const db = getDb();
const [legacyProfiles, profileMeta] = await Promise.all([
  db.collection(BOT_COLLECTION).doc('profiles').get(),
  db.collection(BOT_COLLECTION).doc(profileId).collection('meta').doc('profile').get(),
]);
const knownLegacyProfile = legacyProfiles.exists &&
  (legacyProfiles.data().list || []).some(profile => profile.id === profileId);
if (!knownLegacyProfile && !profileMeta.exists) {
  console.error('Profil tidak ditemukan pada metadata lama maupun metadata baru. Periksa ID sebelum membuat kode.');
  process.exit(1);
}

const mappingDoc = await db.collection(BOT_COLLECTION).doc('uid_mappings').get();
const owner = Object.entries(mappingDoc.exists ? mappingDoc.data() : {})
  .find(([, mappedId]) => mappedId === profileId);
if (owner) {
  console.error('Profil sudah terhubung ke akun Firebase. Periksa kepemilikan sebelum memigrasi ulang.');
  process.exit(1);
}

const code = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(code).digest('hex');
const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
await db.collection('legacy_invites').doc(hash).create({ profileId, expiresAt, createdAt: Date.now() });
console.log(`Profil: ${profileId}`);
console.log(`Berlaku sampai: ${new Date(expiresAt).toISOString()}`);
console.log(`Kode pemulihan (kirim secara privat, satu kali pakai): ${code}`);
