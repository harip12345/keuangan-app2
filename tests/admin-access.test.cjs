const { test } = require('node:test');
const assert = require('node:assert/strict');

test('admin hanya akun Google yang emailnya tepat dan terverifikasi', async () => {
  const { isAdminUser } = await import('../api/lib/adminAccess.js');
  const valid = {
    email: 'haripamungkas519@gmail.com', email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  };
  assert.equal(isAdminUser(valid), true);
  assert.equal(isAdminUser({ ...valid, email: 'other@gmail.com' }), false);
  assert.equal(isAdminUser({ ...valid, email_verified: false }), false);
  assert.equal(isAdminUser({ ...valid, firebase: { sign_in_provider: 'password' } }), false);
  assert.equal(isAdminUser(null), false);
});
