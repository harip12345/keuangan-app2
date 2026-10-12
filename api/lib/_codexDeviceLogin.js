import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexStorageReady, getCodexExecutable, saveCodexAuth } from './_codexScanNota.js';

const LOGIN_TIMEOUT_MS = 240000;
const DEVICE_URL = 'https://auth.openai.com/codex/device';

function childEnvironment(home) {
  const keys = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
  const env = Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.CODEX_HOME = home;
  env.NO_COLOR = '1';
  return env;
}

export async function startCodexDeviceLogin(res) {
  if (!codexStorageReady()) throw new Error('Kunci penyimpanan sesi Codex belum tersedia di server.');
  const binary = await getCodexExecutable();
  const home = await mkdtemp(join(tmpdir(), 'myfinance-codex-login-'));
  await writeFile(join(home, 'config.toml'), 'cli_auth_credentials_store = "file"\ncheck_for_update_on_startup = false\n', { mode: 0o600 });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.statusCode = 200;
  res.flushHeaders?.();

  const send = event => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
  send({ type: 'starting' });

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(binary, ['login', '--device-auth'], {
        cwd: home, env: childEnvironment(home), windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      let codeSent = false;
      let timedOut = false;
      let finished = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, LOGIN_TIMEOUT_MS);
      const onOutput = chunk => {
        output = `${output}${chunk.toString().replace(/\x1b\[[0-9;]*m/g, '')}`.slice(-8192);
        if (!codeSent) {
          const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0];
          if (code) {
            codeSent = true;
            send({ type: 'code', url: DEVICE_URL, code });
          }
        }
      };
      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);
      res.once('close', () => { if (!finished) child.kill(); });
      child.once('error', error => {
        clearTimeout(timer);
        finished = true;
        reject(error);
      });
      child.once('close', code => {
        clearTimeout(timer);
        finished = true;
        if (code === 0) resolve();
        else reject(new Error(timedOut ? 'Waktu login Codex habis. Mulai lagi dari panel admin.' : 'Login Codex dibatalkan atau gagal.'));
      });
    });
    const auth = await readFile(join(home, 'auth.json'));
    await saveCodexAuth(auth);
    send({ type: 'success' });
  } catch (error) {
    send({ type: 'error', message: error.message || 'Login Codex gagal.' });
  } finally {
    res.end();
    await rm(home, { recursive: true, force: true }).catch(error => {
      console.warn('Gagal menghapus berkas login Codex sementara:', error.message);
    });
  }
}
