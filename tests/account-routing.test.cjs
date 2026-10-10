const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const start = html.indexOf('        function checkLoginStatus() {');
const end = html.indexOf('        function switchToMainApp(', start);
assert.ok(start >= 0 && end > start, 'fungsi login ditemukan');
const loginFunction = html.slice(start, end);

function setup({ mapping = {}, readError = null, pending = false } = {}) {
  const elements = {
    loginError: { innerText: '', style: {} },
    loginScreen: { style: {} },
    mainAppContainer: { style: {} },
  };
  const opened = [];
  const errors = [];
  let listener;
  const context = {
    pendingLegacyGoogleLink: pending,
    DB_COLLECTION: 'keuangan_v2',
    auth: { onAuthStateChanged(callback) { listener = callback; } },
    db: { collection() { return { doc() { return { async get() {
      if (readError) throw readError;
      return { exists: true, data: () => mapping };
    } }; } }; } },
    document: { getElementById(id) { return elements[id]; } },
    switchToMainApp(...args) { opened.push(args); },
    safeGetLocal() { return null; },
    APP_USERS: {},
    console: { error(...args) { errors.push(args.map(arg => arg?.message || String(arg))); } },
    localStorage: { removeItem() {} },
  };
  vm.runInNewContext(`${loginFunction}\ncheckLoginStatus();`, context);
  return { listener, opened, elements, errors };
}

const googleUser = { uid: 'google-uid', displayName: 'Pengguna', email: 'user@example.test', photoURL: null };

test('Google membuka profil lama jika sudah terhubung', async () => {
  const app = setup({ mapping: { 'google-uid': 'profil-lama' } });
  await app.listener(googleUser);
  assert.equal(app.opened[0]?.[0], 'profil-lama', JSON.stringify(app.errors));
});

test('gagal membaca mapping tidak membuka profil kosong', async () => {
  const app = setup({ readError: new Error('permission-denied') });
  await app.listener(googleUser);
  assert.equal(app.opened.length, 0);
  assert.match(app.elements.loginError.innerText, /data akun belum bisa dibaca/i);
  assert.equal(app.elements.mainAppContainer.style.display, 'none');
});

test('profil tidak berpindah selama proses penghubungan Google', async () => {
  const app = setup({ pending: true });
  await app.listener(googleUser);
  assert.equal(app.opened.length, 0);
});
