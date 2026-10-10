const { test } = require('node:test');
const assert = require('node:assert/strict');

function response() {
  return {
    code: null, body: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('endpoint profil dan pemulihan menolak permintaan tanpa sesi', async () => {
  const profile = (await import('../api/profile-session.js')).default;
  const claim = (await import('../api/claim-legacy.js')).default;
  const req = { method: 'POST', headers: {}, body: {} };
  const profileRes = response();
  await profile(req, profileRes);
  assert.equal(profileRes.code, 401);

  const claimRes = response();
  await claim(req, claimRes);
  assert.equal(claimRes.code, 401);
});

test('endpoint AI dan pemindai menolak pemakaian tanpa token Firebase', async () => {
  const ai = (await import('../api/ai-chat.js')).default;
  const scanner = (await import('../api/scan-nota.js')).default;
  const bot = (await import('../api/gen-link.js')).default;
  for (const handler of [ai, scanner, bot]) {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.code, 401);
  }
});

test('daftar admin menolak permintaan tanpa sesi', async () => {
  const admin = (await import('../api/admin-users.js')).default;
  const res = response();
  await admin({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.code, 401);
});
