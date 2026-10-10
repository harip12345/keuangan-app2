import { getAuth } from 'firebase-admin/auth';
import { getDb, BOT_COLLECTION } from '../api/lib/_firebaseAdmin.js';

const db = getDb();
const [mappingDoc, legacyDoc] = await Promise.all([
  db.collection(BOT_COLLECTION).doc('uid_mappings').get(),
  db.collection(BOT_COLLECTION).doc('profiles').get(),
]);
const mapping = mappingDoc.exists ? mappingDoc.data() : {};
const legacyIds = new Set((legacyDoc.exists ? legacyDoc.data().list || [] : []).map(item => item.id));
const authUids = new Set();
let pageToken;
do {
  const page = await getAuth().listUsers(1000, pageToken);
  for (const user of page.users) authUids.add(user.uid);
  pageToken = page.pageToken;
} while (pageToken);

const ownersByProfile = new Map();
const findings = [];
for (const [uid, profileId] of Object.entries(mapping)) {
  if (!authUids.has(uid)) findings.push(`UID sumber tidak ada di Firebase Auth: ${uid}`);
  if (typeof profileId !== 'string' || !profileId) {
    findings.push(`profileId tidak valid untuk UID: ${uid}`);
    continue;
  }
  if (profileId === 'profiles' || profileId === 'uid_mappings' || profileId === 'bot_bindings') {
    findings.push(`profileId mengarah ke dokumen sistem: ${uid} -> ${profileId}`);
  }
  const owners = ownersByProfile.get(profileId) || [];
  owners.push(uid);
  ownersByProfile.set(profileId, owners);
}
for (const [profileId, owners] of ownersByProfile) {
  if (owners.length > 1) findings.push(`Profil punya banyak pemilik: ${profileId} <- ${owners.join(', ')}`);
  if (!legacyIds.has(profileId) && !authUids.has(profileId)) {
    findings.push(`Profil tidak ada di daftar lama maupun Firebase Auth: ${profileId}`);
  }
}
for (const profileId of legacyIds) {
  if (!ownersByProfile.has(profileId) && !authUids.has(profileId)) {
    findings.push(`Profil lama belum terhubung: ${profileId}`);
  }
}

console.log(`Firebase Auth: ${authUids.size}; profil lama: ${legacyIds.size}; pemetaan: ${Object.keys(mapping).length}`);
if (findings.length) {
  for (const finding of findings) console.log(`- ${finding}`);
  console.error('Audit menemukan hal yang perlu ditinjau manual. Jangan terapkan rules sebelum kepemilikan dipastikan.');
  process.exitCode = 1;
} else {
  console.log('Tidak ada anomali struktural. Kepemilikan profil tetap harus diverifikasi secara manual.');
}
