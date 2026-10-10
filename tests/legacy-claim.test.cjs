const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

function fakeDb(code, invite, mappings = {}, destinationHasData = false) {
  const inviteHash = createHash('sha256').update(code).digest('hex');
  const writes = [];
  const db = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            key,
            collection(subcollection) {
              return { limit() { return { key: `${key}/${subcollection}` }; } };
            },
          };
        },
      };
    },
    runTransaction(fn) {
      return fn({
        async get(ref) {
          if (ref.key === `legacy_invites/${inviteHash}`) return { exists: Boolean(invite), data: () => invite };
          if (ref.key === 'keuangan_v2/uid_mappings') return { exists: true, data: () => mappings };
          return { empty: !destinationHasData };
        },
        set(ref, data, options) { writes.push({ type: 'set', key: ref.key, data, options }); },
        update(ref, data) { writes.push({ type: 'update', key: ref.key, data }); },
      });
    },
  };
  return { db, writes };
}

test('kode sekali pakai menghubungkan UID Firebase ke profil lama', async () => {
  const { claimLegacyProfile } = await import('../api/claim-legacy.js');
  const { db, writes } = fakeDb('kode-acak', { profileId: 'profil-lama', expiresAt: 2000 }, {}, false);
  assert.equal(await claimLegacyProfile(db, 'firebase-uid', 'kode-acak', 1000), 'profil-lama');
  assert.deepEqual(writes[0].data, { 'firebase-uid': 'profil-lama' });
  assert.deepEqual(writes[1].data, { usedBy: 'firebase-uid', usedAt: 1000 });
});

test('kode bekas, pemilik ganda, dan akun tujuan berisi data ditolak', async () => {
  const { claimLegacyProfile } = await import('../api/claim-legacy.js');
  const cases = [
    fakeDb('kode', { profileId: 'lama', expiresAt: 2000, usedBy: 'lain' }),
    fakeDb('kode', { profileId: 'lama', expiresAt: 2000 }, { lain: 'lama' }),
    fakeDb('kode', { profileId: 'lama', expiresAt: 2000 }, {}, true),
  ];
  for (const { db, writes } of cases) {
    await assert.rejects(claimLegacyProfile(db, 'baru', 'kode', 1000));
    assert.equal(writes.length, 0);
  }
});
