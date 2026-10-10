import { getAuth } from 'firebase-admin/auth';
import { getDb } from './_firebaseAdmin.js';

export async function requireUser(req) {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return null;
  getDb();
  try {
    return await getAuth().verifyIdToken(match[1], true);
  } catch {
    return null;
  }
}
