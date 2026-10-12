const { test } = require('node:test');
const assert = require('node:assert/strict');

const sample = {
  type: 'expense', tanggal: '2026-10-10', nominal: 75000,
  keterangan: 'Toko Maju', kategori: 'Makan dan Minum',
  kategori_custom: '', wallet: 'Tunai'
};

test('scan nota memakai OpenAI terlebih dahulu dan mengirim gambar sebagai input vision', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      status: 'completed', model: 'gpt-6-luna',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(sample) }] }]
    }), { status: 200 });
  };
  try {
    const result = await extractNota({ openaiApiKey: 'openai-test', anthropicApiKey: 'claude-test' }, 'ZmFrZQ==', 'image/png');
    assert.equal(result.provider, 'openai');
    assert.equal(result.hasil.nominal, 75000);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(requests[0].body.model, 'gpt-6-luna');
    assert.equal(requests[0].body.input[0].content[1].image_url, 'data:image/png;base64,ZmFrZQ==');
  } finally {
    global.fetch = originalFetch;
  }
});

test('scan nota beralih ke Claude jika OpenAI gagal', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const requests = [];
  console.warn = () => {};
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url.includes('openai.com')) {
      return new Response(JSON.stringify({ error: { message: 'sementara tidak tersedia' } }), { status: 503 });
    }
    return new Response(JSON.stringify({
      model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(sample) }]
    }), { status: 200 });
  };
  try {
    const result = await extractNota({ openaiApiKey: 'openai-test', anthropicApiKey: 'claude-test' }, 'ZmFrZQ==', 'application/pdf');
    assert.equal(result.provider, 'claude');
    assert.deepEqual(requests.map(item => item.url), ['https://api.openai.com/v1/responses', 'https://api.anthropic.com/v1/messages']);
    assert.equal(requests[0].body.input[0].content[1].type, 'input_file');
    assert.equal(requests[1].body.messages[0].content[0].type, 'document');
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('scan nota tetap memakai Claude jika kunci OpenAI belum tersedia', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({
      model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(sample) }]
    }), { status: 200 });
  };
  try {
    const result = await extractNota({ anthropicApiKey: 'claude-test' }, 'ZmFrZQ==', 'image/jpeg');
    assert.equal(result.provider, 'claude');
    assert.deepEqual(urls, ['https://api.anthropic.com/v1/messages']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('hasil OpenAI tanpa nominal yang terbaca memicu fallback', async () => {
  const { extractNota } = await import('../api/lib/scanNota.js');
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const urls = [];
  console.warn = () => {};
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('openai.com')) {
      return new Response(JSON.stringify({
        status: 'completed', output: [{ type: 'message', content: [{
          type: 'output_text', text: JSON.stringify({ ...sample, nominal: 0 })
        }] }]
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(sample) }]
    }), { status: 200 });
  };
  try {
    const result = await extractNota({ openaiApiKey: 'openai-test', anthropicApiKey: 'claude-test' }, 'ZmFrZQ==', 'image/jpeg');
    assert.equal(result.provider, 'claude');
    assert.deepEqual(urls, ['https://api.openai.com/v1/responses', 'https://api.anthropic.com/v1/messages']);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
