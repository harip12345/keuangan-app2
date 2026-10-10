# Migrasi keamanan MyFinanceApp

Kode lama pernah mengirim username dan kata sandi tetap ke browser. Kata sandi itu **tidak dapat dipakai untuk membuktikan kepemilikan profil lama**. Versi ini menonaktifkan login tersebut dan login biometrik lokal yang tidak membuat sesi Firebase.

## Sebelum menerapkan ke produksi

1. Pastikan Vercel memiliki `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, dan `FIREBASE_PRIVATE_KEY` untuk proyek `website-keuangan-1c179`. Simpan kunci hanya di environment Vercel, bukan di Git. Endpoint `/api/profile-session`, `/api/claim-legacy`, dan `/api/admin-users` memerlukannya.
2. Pastikan Google dan Email/Password aktif di Firebase Authentication. Admin masuk memakai Google `haripamungkas519@gmail.com` dengan email terverifikasi. Hak admin diperiksa pada server, dan tersedia di `/admin` setelah penerapan.
3. Pastikan `TELEGRAM_WEBHOOK_SECRET` sudah diatur di Vercel. Webhook kini menolak permintaan bila rahasia ini tidak tersedia. Daftarkan ulang webhook setelah nilai disiapkan.
4. Jalankan `node scripts/audit-profile-mappings.mjs` dengan kredensial Firebase Admin yang aman, lalu audit dokumen `keuangan_v2/uid_mappings` sebelum menerapkan rules. Setiap profil lama hanya boleh dimiliki satu UID yang benar. Pemetaan yang sudah terlanjur dibuat oleh klien lama tidak otomatis dapat dipercaya; hasil audit struktural saja bukan bukti kepemilikan.
5. Terapkan kode web dan API, lalu terapkan `firestore.rules` sesegera mungkin dengan akun Firebase yang punya hak deploy: `firebase deploy --only firestore:rules --project website-keuangan-1c179`. Selama rules lama masih terbuka, aplikasi versi lama yang tersimpan di cache tetap berisiko.

## Menghubungkan profil lama

1. Verifikasi identitas pemilik profil melalui saluran privat di luar kata sandi lama. Di panel admin, catat `profileId` yang berstatus **Perlu migrasi**.
2. Dengan kredensial Firebase Admin di environment lokal yang aman, jalankan `node scripts/create-legacy-invite.mjs <profileId>`. Kode acak hanya ditampilkan sekali di terminal, berlaku 24 jam, dan disimpan di Firestore sebagai hash.
3. Kirim kode kepada pemilik secara privat. Pemilik masuk ke MyFinanceApp dengan akun Google atau email Firebase yang baru, membuka **Pengaturan → Pulihkan data akun lama dengan kode admin**, lalu memasukkan kode tersebut.
4. Endpoint menolak kode kedaluwarsa/bekas pakai, profil yang telah ditautkan ke UID lain, dan akun tujuan yang sudah mempunyai transaksi/aset/target/chat sendiri. Data lama tidak dipindah atau ditimpa; UID Firebase diberi akses ke `profileId` lama setelah klaim berhasil.
5. Semua pemilik akun yang memakai kata sandi yang pernah terpapar perlu menggantinya pada layanan lain tempat kata sandi tersebut digunakan. Akun Firebase Email/Password baru harus memakai kata sandi baru.

## Batasan penerapan

Panel `/admin` hanya memberi akses **di aplikasi** kepada login Google `haripamungkas519@gmail.com`. Itu tidak memberikan peran IAM/Firebase Console pada proyek. Pemilik proyek Firebase yang sudah memiliki akses harus mengundang alamat tersebut melalui pengaturan IAM proyek bila akses konsol juga dibutuhkan.

Kode ini tidak dapat membuat kredensial Firebase Admin, menerapkan rules produksi, atau mendistribusikan kode pemulihan tanpa akses admin proyek. Jangan menganggap database produksi sudah aman sebelum rules benar-benar terpasang dan pemetaan lama diaudit.
