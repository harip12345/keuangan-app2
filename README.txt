Ikon MyFinanceApp - untuk di-deploy ke Vercel
=======================================================

Letakkan SEMUA file ini di ROOT project Vercel:

  index.html             (landing page)
  landing.css            (gaya landing page)
  landing.js             (interaksi landing page)
  app.html               (aplikasi keuangan)
  vercel.json            (URL bersih: /app tanpa .html)
  manifest.webmanifest
  icon.svg
  icon-192.png
  icon-512.png
  icon-maskable-512.png
  apple-touch-icon.png
  favicon-32.png   (opsional)

app.html sudah otomatis menautkan:
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

Cara pakai di HP:
- Android (Chrome): buka situs -> menu -> "Add to Home screen" / "Install app".
- iPhone (Safari): buka situs -> Share -> "Add to Home Screen".
  (iOS memakai apple-touch-icon.png 180x180.)
  Buka /app terlebih dahulu agar shortcut menuju aplikasi. Manifest PWA
  juga memakai /app sebagai start_url. URL /app.html lama otomatis dialihkan
  ke /app oleh konfigurasi Vercel.

Catatan: ikon home screen butuh diakses lewat HTTPS (domain Vercel), bukan file lokal.

SCAN NOTA DENGAN 9ROUTER
========================

Endpoint scan nota hanya memakai model vision dari 9Router. Di Vercel, isi
Environment Variables berikut lalu redeploy:
  - NINEROUTER_BASE_URL = URL publik 9Router yang diakhiri /v1
  - NINEROUTER_API_KEY  = API key endpoint dari dashboard 9Router
Model scan nota dikunci ke Claude Haiku 5.5 (`anthropic/claude-haiku-5-5`).
Hubungkan provider Anthropic API di dashboard 9Router dan pastikan ID model
tersebut tersedia. Variabel NINEROUTER_MODEL tidak digunakan untuk scan nota.

Contoh format URL: https://<host-9router-anda>/v1
Jangan gunakan localhost:20128 untuk deployment Vercel: alamat localhost di
server Vercel menunjuk ke server Vercel itu sendiri, bukan komputer Anda.
Model harus mendukung input gambar. Scan nota hanya mengirim gambar ke 9Router;
jika konfigurasi, router, atau modelnya gagal, pemindaian berhenti dan tidak
beralih ke penyedia AI lain. Gambar nota dikirim dari endpoint Vercel ke
9Router untuk diproses.

FITUR BOT TELEGRAM (input transaksi via chat)
===========================================

1. Bikin bot lewat @BotFather di Telegram (gratis, resmi) -> dapatkan token.
2. Di Vercel, set Environment Variables:
   - TELEGRAM_BOT_TOKEN        = token dari BotFather (wajib)
   - TELEGRAM_WEBHOOK_SECRET   = string rahasia Telegram (opsional; jika kosong,
                                 aplikasi membuatnya otomatis dari token bot)
   - TELEGRAM_WEBHOOK_URL      = URL HTTPS webhook (opsional; default:
                                 https://myfinanceapp.my.id/api/telegram-webhook)
   - TELEGRAM_SERVICE_KEY      = string rahasia bebas (opsional, untuk endpoint
                                 registrasi manual)
   - FIREBASE_PROJECT_ID       = ID project Firebase (wajib)
   - FIREBASE_CLIENT_EMAIL     = email service account Firebase (wajib)
   - FIREBASE_PRIVATE_KEY      = private key service account (wajib, simpan utuh
                                  dengan \n; Vercel otomatis menambahkan "-----BEGIN..." )
   Catatan: FIREBASE_* diambil dari Firebase Console -> Project Settings ->
   Service Accounts -> Generate new private key. Scan nota via bot memakai
   konfigurasi 9Router di atas.
3. Setelah deploy, buka Pengaturan -> Bot & Otomasi saat login dengan
   Email/Google. Aplikasi akan memeriksa dan mendaftarkan ulang webhook bot
   secara otomatis ke domain produksi. Jika gagal, status akan menunjukkan
   pesan error. Untuk memeriksa webhook secara manual (perlu SERVICE_KEY):
   curl -X POST https://<domain-vercel>/api/telegram-register-webhook \
        -H "Content-Type: application/json" \
        -H "x-service-key: <TELEGRAM_SERVICE_KEY>" \
        -d '{"action":"info"}'
4. Di app: login -> Pengaturan -> "Hubungkan Bot Telegram" -> tap "Buka Telegram
   & Kirim Kode". Chat otomatis terikat ke profil yang sedang login.
5. Contoh perintah di bot: "makan 50000", "ngopi 25rb", "gaji 3jt",
   "transfer 100rb dari tunai ke bsi", "kemarin ojek 20rb", "saldo", "riwayat",
   plus foto nota untuk scan otomatis.

Struktur file baru:
- api/lib/             (firebaseAdmin, bindings, waParser, scanNota — tanpa underscore
                        karena Vercel mengabaikan folder berawalan "_")
- api/gen-link.js      (kode pairing / status / putus koneksi)
- api/telegram-webhook.js (otak bot)
- api/telegram-register-webhook.js
