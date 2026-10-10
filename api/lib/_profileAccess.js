import { getDb, BOT_COLLECTION } from './_firebaseAdmin.js';

export async function getOwnedProfileId(uid) {
  const doc = await getDb().collection(BOT_COLLECTION).doc('uid_mappings').get();
  const mapping = doc.exists ? doc.data() : {};
  return mapping[uid] || uid;
}
