const { test } = require('node:test');
const assert = require('node:assert/strict');

const sample = {
  type: 'expense', tanggal: '2026-10-10', nominal: 75000,
  keterangan: 'Toko Maju', kategori: 'Makan dan Minum',
  kategori_custom: '', wallet: 'Tunai'
};

test('scan nota memakai Codex CLI terlebih dahulu', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('Claude tidak seharusnya dipanggil'); };
  try {
    let received;
    const result = await extractNota({
      anthropicApiKey: 'claude-test',
      codexRunner: async (...args) => {
        received = args;
        return { rawText: JSON.stringify(sample), model: 'gpt-6-luna' };
      }
    }, 'ZmFrZQ==', 'image/png');
    assert.equal(result.provider, 'codex');
    assert.equal(result.hasil.nominal, 75000);
    assert.equal(received[0], 'ZmFrZQ==');
    assert.equal(received[1], 'image/png');
    assert.match(received[2], /nota\/struk/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('scan nota beralih ke Claude jika Codex gagal', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const requests = [];
  console.warn = () => {};
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(sample) }]
    }), { status: 200 });
  };
  try {
    const result = await extractNota({
      anthropicApiKey: 'claude-test',
      codexRunner: async () => { throw new Error('CLI sementara tidak tersedia'); }
    }, 'ZmFrZQ==', 'application/pdf');
    assert.equal(result.provider, 'claude');
    assert.deepEqual(requests.map(item => item.url), ['https://api.anthropic.com/v1/messages']);
    assert.equal(requests[0].body.messages[0].content[0].type, 'document');
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('hasil Codex tanpa nominal yang terbaca memicu fallback', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  global.fetch = async () => new Response(JSON.stringify({
    model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(sample) }]
  }), { status: 200 });
  try {
    const result = await extractNota({
      anthropicApiKey: 'claude-test',
      codexRunner: async () => ({ rawText: JSON.stringify({ ...sample, nominal: 0 }), model: 'gpt-6-luna' })
    }, 'ZmFrZQ==', 'image/jpeg');
    assert.equal(result.provider, 'claude');
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('scan gagal jelas bila Codex dan fallback tidak tersedia', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(
      extractNota({ codexRunner: async () => { throw new Error('Sesi Codex belum tersedia'); } }, 'ZmFrZQ==', 'image/png'),
      /Fallback Claude belum dikonfigurasi/
    );
  } finally {
    console.warn = originalWarn;
  }
});
