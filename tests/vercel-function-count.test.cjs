const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

test('berkas API yang dijadikan Vercel Functions tetap di bawah batas Hobby', () => {
  const apiRoot = join(__dirname, '..', 'api');
  const routes = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(js|mjs|ts)$/.test(entry.name)) routes.push(path);
    }
  }
  visit(apiRoot);
  assert.ok(routes.length <= 12, `Vercel Hobby mengizinkan paling banyak 12 function; ditemukan ${routes.length}`);
  assert.equal(routes.length, 8);
});
