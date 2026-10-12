// Codex CLI vision runner. On Vercel, a protected Firestore document stores
// the rotating CLI login cache encrypted at rest; local runs use codex login.
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getDb } from './firebaseAdmin.js';

export const CODEX_SCAN_MODEL = 'gpt-6-luna';
const AUTH_COLLECTION = 'server_config';
const AUTH_DOCUMENT = 'codex_scan_auth';
const AUTH_AAD = Buffer.from('myfinanceapp:codex-scan-auth:v1');
const CLI_TIMEOUT_MS = 22000;
const LEASE_MS = 45000;
const moduleRequire = createRequire(import.meta.url);

function encryptionKey() {
  const value = process.env.CODEX_AUTH_ENCRYPTION_KEY;
  const key = value ? Buffer.from(value, 'base64') : null;
  if (!key || key.length !== 32) throw new Error('CODEX_AUTH_ENCRYPTION_KEY belum diatur dengan benar.');
  return key;
}

function encryptAuth(auth, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AUTH_AAD);
  const ciphertext = Buffer.concat([cipher.update(auth), cipher.final()]);
  return {
    version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptAuth(value, key) {
  if (value?.version !== 1 || !value.iv || !value.tag || !value.ciphertext) {
    throw new Error('Penyimpanan sesi Codex tidak valid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(AUTH_AAD);
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]);
}

function bootstrapAuth() {
  const encoded = process.env.CODEX_AUTH_JSON_B64;
  if (!encoded) throw new Error('Sesi Codex belum tersedia. Atur CODEX_AUTH_JSON_B64 di Vercel.');
  const auth = Buffer.from(encoded, 'base64');
  if (auth.length > 65536 || auth.length < 100) throw new Error('CODEX_AUTH_JSON_B64 tidak valid.');
  try { JSON.parse(auth.toString('utf8')); } catch { throw new Error('CODEX_AUTH_JSON_B64 bukan JSON yang valid.'); }
  return auth;
}

async function acquireStoredAuth() {
  const key = encryptionKey();
  const ref = getDb().collection(AUTH_COLLECTION).doc(AUTH_DOCUMENT);
  const owner = randomUUID();
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    let auth;
    const acquired = await getDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() || {};
      if (Number(data.leaseUntil) > Date.now()) return false;
      auth = data.auth ? decryptAuth(data.auth, key) : bootstrapAuth();
      transaction.set(ref, {
        leaseOwner: owner,
        leaseUntil: Date.now() + LEASE_MS,
        ...(data.auth ? {} : { auth: encryptAuth(auth, key) })
      }, { merge: true });
      return true;
    });
    if (acquired) {
      return {
        auth,
        async release(nextAuth) {
          await getDb().runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (snapshot.data()?.leaseOwner !== owner) return;
            transaction.set(ref, {
              leaseOwner: null, leaseUntil: 0,
              ...(nextAuth ? { auth: encryptAuth(nextAuth, key) } : {})
            }, { merge: true });
          });
        }
      };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Codex sedang memproses nota lain.');
}

function packagedBinary() {
  if (process.platform !== 'linux' || process.arch !== 'x64') return null;
  const candidates = [];
  try { candidates.push(dirname(moduleRequire.resolve('@openai/codex-linux-x64/package.json'))); } catch (_) { /* fallback below */ }
  candidates.push(join(process.cwd(), 'node_modules', '@openai', 'codex-linux-x64'));
  for (const root of candidates) {
    const binary = join(root, 'vendor', 'x86_64-unknown-linux-musl', 'bin', 'codex');
    if (existsSync(binary)) return binary;
  }
  return null;
}

function executable() {
  if (process.env.CODEX_CLI_PATH) return process.env.CODEX_CLI_PATH;
  const packaged = packagedBinary();
  if (packaged) return packaged;
  if (process.env.VERCEL) throw new Error('Binary Codex tidak ikut dalam Vercel Function.');
  return 'codex';
}

function childEnvironment(codexHome) {
  const keys = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
  const env = Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  if (codexHome) env.CODEX_HOME = codexHome;
  return env;
}

function runCli(args, cwd, codexHome) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(), args, {
      cwd, env: childEnvironment(codexHome), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, CLI_TIMEOUT_MS);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(timedOut ? 'Codex CLI melewati batas waktu.' : `Codex CLI gagal (kode ${code ?? 'tidak tersedia'}).`));
    });
  });
}

async function removeTemporaryFiles(directory, names) {
  for (const name of names) {
    try { await unlink(join(directory, name)); } catch (error) { if (error.code !== 'ENOENT') console.warn('Gagal menghapus berkas sementara Codex:', error.message); }
  }
  try { await rmdir(directory); } catch (error) { console.warn('Gagal menghapus direktori sementara Codex:', error.message); }
}

export async function scanNotaWithCodex(imageBase64, mediaType, prompt) {
  if (mediaType === 'application/pdf') throw new Error('PDF diproses melalui Claude.');
  const directory = await mkdtemp(join(tmpdir(), 'myfinance-codex-'));
  let stored;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mediaType];
  const imageName = `nota.${extension}`;
  const outputName = 'hasil.json';
  let refreshedAuth = null;
  try {
    stored = process.env.VERCEL ? await acquireStoredAuth() : null;
    const codexHome = stored ? directory : null;
    await writeFile(join(directory, imageName), Buffer.from(imageBase64, 'base64'), { mode: 0o600 });
    if (stored) {
      await writeFile(join(directory, 'auth.json'), stored.auth, { mode: 0o600 });
      await writeFile(join(directory, 'config.toml'), 'cli_auth_credentials_store = "file"\ncheck_for_update_on_startup = false\n', { mode: 0o600 });
    }
    await runCli([
      'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '-s', 'read-only',
      '-m', CODEX_SCAN_MODEL, '-o', join(directory, outputName), '--image', join(directory, imageName),
      '--', `${prompt}\nJangan jalankan tool, jangan baca berkas lain, dan jawab hanya JSON murni.`
    ], directory, codexHome);
    const rawText = (await readFile(join(directory, outputName), 'utf8')).trim();
    if (!rawText) throw new Error('Codex tidak menghasilkan jawaban.');
    return { rawText, model: CODEX_SCAN_MODEL };
  } finally {
    if (stored) {
      try { refreshedAuth = await readFile(join(directory, 'auth.json')); } catch (_) { /* original auth remains */ }
      try { await stored.release(refreshedAuth); } catch (error) { console.error('Gagal menyimpan sesi Codex:', error.message); }
    }
    await removeTemporaryFiles(directory, [imageName, outputName, 'auth.json', 'config.toml']);
  }
}
