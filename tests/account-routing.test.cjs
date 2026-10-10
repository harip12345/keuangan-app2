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

function setup({ status = 200, session = { profileId: 'profil-lama', profile: { name: 'Hari' } } } = {}) {
  const elements = {
    loginError: { innerText: '', style: {} },
    loginScreen: { style: {} },
    mainAppContainer: { style: {} },
  };
  const opened = [];
  const requests = [];
  let listener;
  const user = {
    uid: 'google-uid', displayName: 'Pengguna', email: 'user@example.test', photoURL: null,
    async getIdToken() { return 'firebase-token'; },
  };
  const context = {
    auth: { currentUser: user, onAuthStateChanged(callback) { listener = callback; } },
    async fetch(url, options) {
      requests.push({ url, options });
      return { ok: status === 200, async json() { return session; } };
    },
    document: { getElementById(id) { return elements[id]; } },
    switchToMainApp(...args) { opened.push(args); },
    console: { error() {} },
  };
  vm.runInNewContext(`${loginFunction}\ncheckLoginStatus();`, context);
  return { listener, opened, elements, requests, user };
}

test('sesi Firebase terverifikasi membuka profil lama yang dipetakan server', async () => {
  const app = setup();
  await app.listener(app.user);
  assert.equal(app.opened[0]?.[0], 'profil-lama');
  assert.equal(app.opened[0]?.[3]?.name, 'Hari');
  assert.equal(app.requests[0]?.url, '/api/profile-session');
  assert.equal(app.requests[0]?.options.headers.Authorization, 'Bearer firebase-token');
});

test('kegagalan verifikasi sesi tidak membuka profil kosong', async () => {
  const app = setup({ status: 401, session: { error: 'Sesi tidak valid' } });
  await app.listener(app.user);
  assert.equal(app.opened.length, 0);
  assert.match(app.elements.loginError.innerText, /belum bisa diverifikasi/i);
  assert.equal(app.elements.mainAppContainer.style.display, 'none');
});

test('tanpa sesi Firebase aplikasi tetap pada layar login', async () => {
  const app = setup();
  await app.listener(null);
  assert.equal(app.opened.length, 0);
  assert.equal(app.elements.mainAppContainer.style.display, 'none');
  assert.equal(app.elements.loginScreen.style.display, 'flex');
});
