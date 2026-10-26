# FinTrack Pro — Manajemen Keuangan Pribadi (Glassmorphism Web App)

Aplikasi pencatatan keuangan pribadi modern dengan estetika **Living Glassmorphism**, visualisasi data real-time, dan **keamanan multi-akun terisolasi 100% lokal** di perangkat Anda.

---

## 🚀 Keunggulan & Fitur Utama

1. **Multi-Akun Terisolasi Mandiri (Multi-Tenant Local)**
   - Setiap akun yang didaftarkan memiliki basis data keuangan (`FINTRACK_DATA_V2_{userId}`) yang **sepenuhnya terpisah**.
   - Akun baru dimulai dengan saldo bersih **Rp 0** (tanpa bercampur dengan akun lain).
   - Pengguna dapat memuat data contoh melalui tombol *Muat Data Contoh* di Pengaturan jika ingin mencoba simulasi.

2. **Keamanan Kredensial Standar Industri**
   - Password diamankan dengan teknik **PBKDF2** (150.000 iterasi SHA-256) + salt acak 16-byte unik per pengguna.
   - Sesi terproteksi dengan pembatasan percobaan login (*rate limiting* / anti-brute force).

3. **Atomic Balance & Multi-Dompet**
   - Mendukung berbagai jenis dompet: Rekening Bank, E-Wallet, Uang Tunai, dan Kartu Kredit/PayLater.
   - Perhitungan saldo atomik untuk Pemasukan, Pengeluaran, dan Transfer Antar-Dompet (termasuk biaya admin transfer).

4. **Visualisasi Interaktif (Chart.js)**
   - Tren arus kas mingguan, bulanan, tahunan, dan sepanjang masa.
   - Rincian pengeluaran per kategori dalam bentuk Donut Chart transparan.

5. **Living Glassmorphism UI & Responsif Penuh**
   - Efek aurora hidup di latar belakang dengan pencahayaan dinamis mengikuti kursor (*cursor glow*).
   - Desain responsif di semua perangkat: Sidebar elegan di Desktop (>1024px) dan Floating Glass Bar di Mobile.

6. **Backup, Restore & Ekspor CSV**
   - Ekspor laporan transaksi ke format `.CSV` (kompatibel Excel & Google Sheets).
   - Backup seluruh data akun ke file `.JSON` dan restore kapan saja.

---

## 📁 Struktur Proyek (Arsitektur Modular ES6+)

Proyek ini telah direfaktor dari file tunggal menjadi arsitektur modular yang stabil, mudah dirawat, dan siap untuk di-deploy/diresmikan:

```
KEUANGANKU/
├── css/
│   └── style.css            # Desain Glassmorphism, Aurora Blobs, Micro-animations
├── js/
│   ├── config.js            # Konstanta penyimpanan, format Rupiah, kategori default
│   ├── storage.js           # Layer penyimpanan per user (CRUD, CSV export, Backup/Restore)
│   ├── auth.js              # Autentikasi PBKDF2, enkripsi hash, sesi pengguna
│   ├── charts.js            # Visualisasi Chart.js (Tren Bar Chart & Donut Kategori)
│   └── app.js               # Controller utama aplikasi & binding interaksi DOM
├── dist/                    # Hasil kompilasi siap produksi (dihasilkan oleh npm run build)
├── index.html               # Entry point utama web application (Vite & Production)
├── fintrack_pro_manajemen_keuangan_pribadi.html # Standalone fallback
├── package.json             # Konfigurasi dependensi dan script npm
└── README.md                # Dokumentasi proyek
```

---

## 🐘 Sinkronisasi Database PostgreSQL (Akses Chrome Laptop & Chrome HP)

Aplikasi FinTrack Pro kini terintegrasi langsung dengan database **PostgreSQL** yang berjalan di komputer Anda. Sangat simpel:
- **Tanpa konfigurasi rumit:** Tidak perlu mendaftar console eksternal, membuat API key, atau menyalin kode yang membingungkan.
- **Akses dari Laptop & HP:** Akun yang dibuat di laptop langsung tersimpan di PostgreSQL dan bisa langsung dibuka di Chrome HP Anda pada jaringan Wi-Fi yang sama.
- **Data Terisolasi:** Setiap akun hanya dapat mengakses data keuangannya masing-masing.

### Konfigurasi Database (`.env`):
Secara default, aplikasi langsung terhubung ke PostgreSQL lokal Anda:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/keuanganku
JWT_SECRET=fintrack_pro_jwt_secret_key_2026
```
Database `keuanganku` serta tabel `users` dan `user_states` akan dibuat secara otomatis saat server pertama kali dijalankan.

---

## 🛠️ Panduan Menjalankan

### Menjalankan Server & Membuka di Laptop dan HP:
Cukup jalankan perintah berikut di terminal:
```bash
npm start
```
Terminal akan langsung menampilkan alamat akses:
- **Di Laptop:** Buka `http://localhost:3000`
- **Di Chrome HP:** Buka alamat IP lokal Anda yang tertera di terminal, contoh: `http://192.168.18.11:3000`

Kini Anda dapat mendaftar, login, dan mencatat transaksi langsung dari laptop maupun HP dengan sinkronisasi database PostgreSQL otomatis!
