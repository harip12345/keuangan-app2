// Pemroses Vision (OCR Nota) — dipakai bersama oleh /api/scan-nota dan webhook Telegram.
// Kunci API hanya dipakai di server; gambar dikirim langsung ke Anthropic.
export const SCAN_NOTA_MODEL = 'claude-haiku-5-5';

function notaContentBlock(imageBase64, mimeType) {
  const mediaType = String(mimeType || 'image/jpeg').split(';')[0].toLowerCase();
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };
  }
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    throw new Error('Format nota tidak didukung Claude. Gunakan JPG, PNG, WebP, GIF, atau PDF.');
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };
}

async function callClaudeVision(apiKey, imageBase64, mimeType, prompt) {
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(50000),
      body: JSON.stringify({
        model: SCAN_NOTA_MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [{
          role: 'user',
          content: [notaContentBlock(imageBase64, mimeType), { type: 'text', text: prompt }]
        }]
      })
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('Claude tidak merespons dalam 50 detik. Coba lagi.');
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

// Mengembalikan { hasil, model_used, provider } atau gagal dengan error Claude.
export async function extractNota(anthropicConfig, imageBase64, mimeType) {
  const prompt = buildNotaPrompt();
  if (!anthropicConfig.apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum diatur di Vercel.');
  }
  const { status, data } = await callClaudeVision(anthropicConfig.apiKey, imageBase64, mimeType, prompt);
  if (status !== 200) {
    throw new Error(`Claude (${SCAN_NOTA_MODEL}): ${data?.error?.message || 'HTTP ' + status}`);
  }

  if (data?.stop_reason === 'max_tokens') throw new Error('Claude memotong hasil scan nota. Coba foto nota yang lebih jelas.');
  const rawText = (data?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
  if (!rawText) throw new Error(`Claude (${SCAN_NOTA_MODEL}): respons teks kosong`);

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude (${SCAN_NOTA_MODEL}): respons JSON tidak ditemukan`);

  const hasil = JSON.parse(jsonMatch[0]);
  if (!hasil.nominal && !hasil.keterangan) throw new Error(`Claude (${SCAN_NOTA_MODEL}): data penting nota tidak terbaca`);

  if (!validTypes.includes(hasil.type)) hasil.type = 'expense';
  if (!validWallets.includes(hasil.wallet)) hasil.wallet = 'Tunai';
  const validCats = hasil.type === 'income' ? validIncCats : validExpCats;
  if (!validCats.includes(hasil.kategori)) hasil.kategori = 'Lainnya';

  return { hasil, model_used: data?.model || SCAN_NOTA_MODEL, provider: 'claude' };
}
