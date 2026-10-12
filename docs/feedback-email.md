# Pengiriman saran dan masukan

Menu **Saran & Masukan** di profil mengirim email lewat Resend dari Function Vercel. Cloudflare Email Routing tetap menerima email untuk `admin@myfinanceapp.my.id`.

1. Verifikasi domain `myfinanceapp.my.id` di Resend untuk **sending**. Tambahkan DNS pengiriman yang diminta Resend di Cloudflare; pertahankan MX utama Cloudflare Email Routing untuk email masuk.
2. Buat API key Resend dengan izin mengirim email.
3. Tambahkan Environment Variables berikut di proyek Vercel, lalu redeploy:

   - `RESEND_API_KEY`: API key Resend.
   - `FEEDBACK_FROM_EMAIL`: misalnya `MyFinanceApp <feedback@myfinanceapp.my.id>` pada domain yang telah diverifikasi.
   - `FEEDBACK_TO_EMAIL`: opsional; default `admin@myfinanceapp.my.id`.

Kunci hanya dibaca server. Formulir memerlukan sesi Firebase, membatasi panjang pesan, dan membatasi lima kiriman per akun per jam. Aplikasi menampilkan keberhasilan hanya setelah Resend menerima permintaan email. Jika konfigurasi belum tersedia atau pengiriman gagal, teks pengguna tetap ada di formulir untuk dicoba kembali.
