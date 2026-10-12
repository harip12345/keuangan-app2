// Pemroses Vision (OCR Nota) — dipakai bersama oleh /api/scan-nota dan webhook Telegram.
// Kunci provider hanya dipakai di server. OpenAI digunakan lebih dulu, Claude sebagai fallback.
export const SCAN_NOTA_MODEL = 'gpt-6-luna';
export const SCAN_NOTA_FALLBACK_MODEL = 'claude-haiku-5-5';

const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function notaMediaType(mimeType) {
  const mediaType = String(mimeType || 'image/jpeg').split(';')[0].toLowerCase();
  if (mediaType !== 'application/pdf' && !supportedImageTypes.includes(mediaType)) {
    throw new Error('Format nota tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau PDF.');
  }
  return mediaType;
}

function openAiContentBlock(imageBase64, mediaType) {
  if (mediaType === 'application/pdf') {
    return { type: 'input_file', filename: 'nota.pdf', file_data: `data:${mediaType};base64,${imageBase64}` };
  }
  return { type: 'input_image', image_url: `data:${mediaType};base64,${imageBase64}`, detail: 'high' };
}

async function callOpenAiVision(apiKey, imageBase64, mediaType, prompt) {
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(24000),
      body: JSON.stringify({
        model: SCAN_NOTA_MODEL,
        reasoning: { effort: 'none' },
        store: false,
        max_output_tokens: 1200,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: prompt },
          openAiContentBlock(imageBase64, mediaType)
        ] }],
        text: { format: { type: 'json_schema', name: 'scan_nota', strict: true, schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['expense', 'income'] },
            tanggal: { type: 'string' },
            nominal: { type: 'integer' },
            keterangan: { type: 'string' },
            kategori: { type: 'string' },
            kategori_custom: { type: 'string' },
            wallet: { type: 'string' }
          },
          required: ['type', 'tanggal', 'nominal', 'keterangan', 'kategori', 'kategori_custom', 'wallet'],
          additionalProperties: false
        } } }
      })
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('OpenAI tidak merespons dalam 24 detik.');
    throw error;
  }
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    throw new Error(`Respons OpenAI bukan JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(`OpenAI (${SCAN_NOTA_MODEL}): ${data?.error?.message || 'HTTP ' + response.status}`);
  if (data.status !== 'completed') throw new Error(`OpenAI (${SCAN_NOTA_MODEL}): respons ${data.status || 'tidak lengkap'}`);
  const rawText = (data.output || [])
    .filter(item => item.type === 'message')
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('\n');
  if (!rawText) throw new Error(`OpenAI (${SCAN_NOTA_MODEL}): respons teks kosong`);
  return { rawText, model: data.model || SCAN_NOTA_MODEL };
}

function notaContentBlock(imageBase64, mediaType) {
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };
}

async function callClaudeVision(apiKey, imageBase64, mediaType, prompt) {
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: SCAN_NOTA_FALLBACK_MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [{
          role: 'user',
          content: [notaContentBlock(imageBase64, mediaType), { type: 'text', text: prompt }]
        }]
      })
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('Claude tidak merespons dalam 30 detik. Coba lagi.');
    throw error;
  }
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    const detail = responseText
      .replace(/<[^>]*>/g, ' ')
      .split(apiKey).join('[API KEY REDACTED]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    throw new Error(`Respons Claude bukan JSON (HTTP ${response.status}): ${detail || '(kosong)'}`);
  }
  return { status: response.status, data };
}

export function buildNotaPrompt(todayISO) {
  const today = todayISO || new Date().toISOString().split('T')[0];
  return `Kamu adalah asisten pencatatan keuangan pribadi. Baca gambar nota/struk/receipt/kwitansi ini dengan teliti.

Tentukan informasi berikut lalu balas HANYA dengan JSON murni (tanpa markdown, tanpa backtick, tanpa penjelasan):
{
  "type": "expense",
  "tanggal": "YYYY-MM-DD",
  "nominal": 75000,
  "keterangan": "deskripsi singkat transaksi",
  "kategori": "Jajan",
  "kategori_custom": "",
  "wallet": "Tunai"
}

=== ATURAN TYPE ===
- "expense": pembayaran/pembelian/pengeluaran
- "income": bukti penerimaan uang/gaji/hasil jual

=== ATURAN KATEGORI ===
Jika expense, pilih SATU: Bensin, Body care, Dating, Ganti Oli, Infak, Jajan, Jalan-jalan, Makan dan Minum, Make up, Ngasih Ortu, Ngopi, Ojek, Parkir, Kuota/Wifi, Sabun Muka, Shopping, Skincare, Staycation, Sunscreen, Tabungan, Lainnya
Jika income, pilih SATU: Gaji / Upah, Hasil Usaha / Bisnis, Bonus / THR, Pemberian / Uang Saku, Pencairan Investasi, Lainnya

Panduan: Klinik/dokter/apotek → Lainnya | Makan/cafe → Makan dan Minum | Grab/Gojek → Ojek | Belanja online/mall → Shopping | Listrik/internet → Kuota/Wifi

=== ATURAN WALLET ===
Pilih SATU: Tunai, Muamalat, BSI, Bank Jago, SeaBank, Blu, e-Wallet
CASH/Tunai → Tunai | QRIS/GoPay/OVO/Dana → e-Wallet | Tidak ada petunjuk → Tunai

=== ATURAN LAIN ===
- tanggal: YYYY-MM-DD, jika tidak ada gunakan: ${today}
- nominal: total akhir dibayar, angka bulat tanpa simbol
- keterangan: nama toko + jenis transaksi, maks 60 karakter
- kategori_custom: isi HANYA jika kategori="Lainnya", tulis jenis pengeluaran 2-4 kata (contoh: "Perawatan Gigi"). Selain itu isi "".
- Balas HANYA JSON, tidak ada teks lain`;
}

const validTypes = ['expense', 'income'];
const validWallets = ['Tunai', 'Muamalat', 'BSI', 'Bank Jago', 'SeaBank', 'Blu', 'e-Wallet'];
const validExpCats = ['Bensin', 'Body care', 'Dating', 'Ganti Oli', 'Infak', 'Jajan', 'Jalan-jalan', 'Makan dan Minum', 'Make up', 'Ngasih Ortu', 'Ngopi', 'Ojek', 'Parkir', 'Kuota/Wifi', 'Sabun Muka', 'Shopping', 'Skincare', 'Staycation', 'Sunscreen', 'Tabungan', 'Lainnya'];
const validIncCats = ['Gaji / Upah', 'Hasil Usaha / Bisnis', 'Bonus / THR', 'Pemberian / Uang Saku', 'Pencairan Investasi', 'Lainnya'];

function parseNotaResult(rawText, provider) {
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`${provider}: respons JSON tidak ditemukan`);

  const hasil = JSON.parse(jsonMatch[0]);
  if (!Number.isFinite(Number(hasil.nominal)) || Number(hasil.nominal) <= 0 || !hasil.keterangan) {
    throw new Error(`${provider}: data penting nota tidak terbaca`);
  }
  hasil.nominal = Number(hasil.nominal);
  if (!validTypes.includes(hasil.type)) hasil.type = 'expense';
  if (!validWallets.includes(hasil.wallet)) hasil.wallet = 'Tunai';
  const validCats = hasil.type === 'income' ? validIncCats : validExpCats;
  if (!validCats.includes(hasil.kategori)) hasil.kategori = 'Lainnya';
  return hasil;
}

// Mengembalikan { hasil, model_used, provider } dari provider pertama yang berhasil.
export async function extractNota(config, imageBase64, mimeType) {
  const mediaType = notaMediaType(mimeType);
  const prompt = buildNotaPrompt();
  if (!config.openaiApiKey && !config.anthropicApiKey) {
    throw new Error('OPENAI_API_KEY dan ANTHROPIC_API_KEY belum diatur di server.');
  }
  let primaryError;
  if (config.openaiApiKey) {
    try {
      const { rawText, model } = await callOpenAiVision(config.openaiApiKey, imageBase64, mediaType, prompt);
      return { hasil: parseNotaResult(rawText, 'OpenAI'), model_used: model, provider: 'openai' };
    } catch (error) {
      primaryError = error;
      console.warn('Scan nota OpenAI gagal; mencoba Claude:', error.message);
    }
  }
  if (!config.anthropicApiKey) {
    throw new Error(primaryError ? `OpenAI gagal: ${primaryError.message}. Fallback Claude belum dikonfigurasi.` : 'ANTHROPIC_API_KEY belum diatur di server.');
  }
  try {
    const { status, data } = await callClaudeVision(config.anthropicApiKey, imageBase64, mediaType, prompt);
    if (status !== 200) throw new Error(`Claude (${SCAN_NOTA_FALLBACK_MODEL}): ${data?.error?.message || 'HTTP ' + status}`);
    if (data?.stop_reason === 'max_tokens') throw new Error('Claude memotong hasil scan nota. Coba foto nota yang lebih jelas.');
    const rawText = (data?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
    if (!rawText) throw new Error(`Claude (${SCAN_NOTA_FALLBACK_MODEL}): respons teks kosong`);
    return { hasil: parseNotaResult(rawText, 'Claude'), model_used: data?.model || SCAN_NOTA_FALLBACK_MODEL, provider: 'claude' };
  } catch (error) {
    if (primaryError) throw new Error(`OpenAI gagal: ${primaryError.message}. Claude gagal: ${error.message}`);
    throw error;
  }
}
