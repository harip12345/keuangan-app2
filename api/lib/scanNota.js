// Pemroses Vision (OCR Nota) — dipakai bersama oleh /api/scan-nota dan webhook Telegram.
// Scan nota selalu memakai Claude Haiku 5.5 melalui provider Anthropic di 9Router.
export const SCAN_NOTA_MODEL = 'anthropic/claude-haiku-5-5';

async function callNineRouterVision(config, imageBase64, mimeType, prompt) {
  const baseUrl = String(config.baseUrl).replace(/\/+$/, '');
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(parsedBaseUrl.hostname))) {
    throw new Error('NINEROUTER_BASE_URL harus menggunakan HTTPS pada deployment production.');
  }
  const endpoint = /\/chat\/completions$/i.test(baseUrl)
    ? baseUrl
    : `${baseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(50000),
    body: JSON.stringify({
      model: SCAN_NOTA_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 500
    })
  });
  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    const detail = responseText
      .replace(/<[^>]*>/g, ' ')
      .split(config.apiKey).join('[API KEY REDACTED]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    throw new Error(
      `Respons 9Router bukan JSON (HTTP ${response.status}). Pastikan tunnel aktif dan URL mengarah ke endpoint /v1. Respons: ${detail || '(kosong)'}`
    );
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

// Mengembalikan { hasil, model_used, provider } atau gagal dengan error 9Router.
export async function extractNota(nineRouterConfig, imageBase64, mimeType) {
  const prompt = buildNotaPrompt();
  const nineRouterValues = [nineRouterConfig.baseUrl, nineRouterConfig.apiKey];
  if (!nineRouterValues.every(Boolean)) {
    throw new Error('Konfigurasi 9Router belum lengkap. Isi NINEROUTER_BASE_URL dan NINEROUTER_API_KEY di Vercel.');
  }
  const { status, data } = await callNineRouterVision(nineRouterConfig, imageBase64, mimeType, prompt);
  if (status !== 200) {
    throw new Error(`9Router (${SCAN_NOTA_MODEL}): ${data?.error?.message || 'HTTP ' + status}`);
  }

  const rawText = data?.choices?.[0]?.message?.content || '';
  if (!rawText) throw new Error(`9Router (${SCAN_NOTA_MODEL}): respons teks kosong`);

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`9Router (${SCAN_NOTA_MODEL}): respons JSON tidak ditemukan`);

  const hasil = JSON.parse(jsonMatch[0]);
  if (!hasil.nominal && !hasil.keterangan) throw new Error(`9Router (${SCAN_NOTA_MODEL}): data penting nota tidak terbaca`);

  if (!validTypes.includes(hasil.type)) hasil.type = 'expense';
  if (!validWallets.includes(hasil.wallet)) hasil.wallet = 'Tunai';
  const validCats = hasil.type === 'income' ? validIncCats : validExpCats;
  if (!validCats.includes(hasil.kategori)) hasil.kategori = 'Lainnya';

  return { hasil, model_used: data?.model || SCAN_NOTA_MODEL, provider: '9router' };
}
