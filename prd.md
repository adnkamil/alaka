# PRD — Aplikasi Jastip Mici (PWA)

## 1. Ringkasan Produk

Aplikasi manajemen jastip (titip beli) berbasis web, mobile-first, dan bisa
diinstall sebagai PWA. Ditujukan untuk jastiper yang saat ini mengelola
pesanan secara manual (spreadsheet/chat), agar bisa mengelola event belanja,
pesanan pelanggan, dan keuangan dalam satu tempat.

Aplikasi bersifat **multi-tenant** — siapa saja bisa mendaftar dan setiap
user memiliki data (event, pesanan, aturan fee) yang terisolasi dari user
lain. Semua user memiliki role yang sama sebagai jastiper (tidak ada role
customer terpisah).

Model bisnisnya langganan (lihat 5): setiap user baru otomatis dapat **trial
30 hari** dengan semua fitur terbuka, lalu turun ke paket **FREE** (fitur
dasar tetap jalan, fitur PRO terkunci) dan bisa naik ke **PRO** lewat
pembayaran manual yang diverifikasi admin.

## 2. Referensi

Riset awal dilakukan terhadap aplikasi sejenis "JasTip.Nya by Afathya"
(jastipnya-afathya.netlify.app) — versi desktop dengan sidebar navigation.
Konsep inti (Event → Order per customer → Item) diadaptasi dari sana, lalu
didesain ulang mobile-first dengan bottom tab navigation (terinspirasi dari
Astra Otoshop).

## 3. Tech Stack

| Layer               | Pilihan                                                       |
| ------------------- | ------------------------------------------------------------- |
| Framework           | TanStack Start (React 19 + Vite 8)                            |
| Routing             | TanStack Router                                               |
| Data fetching/cache | TanStack Query                                                |
| Styling             | Tailwind CSS v4 (mobile-first)                                |
| PWA                 | vite-plugin-pwa + Workbox (custom service worker)             |
| Database            | PostgreSQL via Drizzle ORM                                    |
| Auth                | Session-based, cookie httpOnly; password di-hash (bcryptjs)   |
| OAuth               | Google OAuth 2.0 (OpenID Connect — login/register via Google) |
| Validasi            | Zod (client & server)                                         |
| Icons               | Lucide React                                                  |

## 4. Fitur & Halaman

### 4.1 Autentikasi

- **Register** — nama, nama brand jastip (opsional), email, password + konfirmasi. Self-service, langsung aktif tanpa verifikasi email (untuk MVP).
- **Login** — email + password, opsi "Ingat saya". Atau **login/register via Google** (Google OAuth 2.0, route `/api/auth/google` + `/api/auth/google/callback`).
- **Lupa Sandi** (`/lupa-sandi`) — user masukkan email, terima link reset via email (mailer).
- **Reset Sandi** (`/reset-sandi/:token`) — halaman ganti password via token sekali pakai (SHA-256 hash, ada `expires_at` + `used_at`).
- Route protection: layout `_app` melakukan `beforeLoad` cek session, redirect ke `/login` jika belum login. Bottom nav tab **tidak muncul** di halaman login/register.

### 4.2 Beranda

- Ringkasan keuangan singkat (2 kartu: **Uang masuk** = total `paidAmount` seluruh event; **Belum bayar** = sisa tagihan semua pesanan yang belum lunas).
- List semua event milik user (diurutkan terbaru dulu): card berisi nama, tanggal (format `d MMM`), jumlah pesanan.
- Tap card → masuk ke Detail Event.
- Link **Tambah event** di pojok kanan atas.
- Avatar pengguna di header → link ke halaman Profil.

### 4.3 Detail Event (`/events/:eventId`)

- **Header**: tombol back, nama event, menu tiga titik (edit/hapus event) dengan konfirmasi hapus.
- **Ringkasan keuangan event**: uang masuk, outstanding, estimasi untung bersih.
- **Dropdown pilih Aturan Fee** untuk event ini (lihat 4.9).
- **Search/filter pelanggan** (filter real-time berdasarkan nama customer).
- **View toggle**: mode "Per Pelanggan" (accordion customer) dan mode "Ringkasan Barang" (lihat 4.3.1).
- List pesanan dikelompokkan per customer (accordion), badge status **Belum Lunas / DP / Lunas / Dikirim**.
- Expand customer → list item + tombol aksi: **Tagih** (→ invoice internal; fitur PRO — di paket FREE tombolnya berubah jadi ikon gembok + badge PRO, dan klik-nya hanya memunculkan dialog upgrade, bukan halaman tagih. Lihat 5), **Tambah**, **Hapus**, **Edit status**.
- **Floating action button (+)** → buka form Tambah Pesanan.
- URL search param `?addOrder=true` → otomatis buka sheet Tambah Pesanan saat navigasi dari tab Tambah di bottom nav.

#### 4.3.1 Mode Ringkasan Barang (Checklist Live Shopping)

- Tampilkan daftar semua **jenis barang** lintas pesanan di event ini, dikelompokkan per nama barang.
- Tiap barang: nama, total qty diorder, jumlah pelanggan yang mesan, dan daftar siapa + berapa qty masing-masing.
- **Checkbox "obtained"** per pelanggan per barang — menandai barang sudah didapat/dibeli di toko saat live shopping.
- Update `obtained` langsung ke server (optimistic update).

### 4.4 Tambah / Edit Pesanan (Bottom Sheet)

- Context: event terkait (chip, non-editable).
- **Nama pelanggan** — autocomplete dari daftar Customer yang tersimpan. Bisa diisi bebas jika belum terdaftar.
- **No. HP pelanggan** — opsional, dipakai untuk kirim WA dari halaman Invoice.
- Barang titipan — repeatable block: nama barang, harga asli, jumlah (qty), fee jastip.
  - **Fee auto-terisi** berdasarkan Aturan Fee event ini + harga barang yang diinput (lihat 4.9). Bila harga di luar semua tier, field fee dikosongkan untuk diisi manual.
  - **Fee berlaku per unit**: total satu barang = `(harga asli + fee) × qty`. Contoh: barang 30.000 + fee 4.000, qty 2 → (30.000 + 4.000) × 2 = 68.000.
  - **Saran nama barang & harga asli** — saat mengisi nama barang, muncul saran dari barang yang pernah dicatat di event ini (nama + daftar harga), diambil dari server (`getOrderSuggestions`). Ini fitur PRO `order_suggestions`: kalau terkunci, field tetap bisa diisi manual dan di tempat saran muncul keterangan "Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO" — server tidak mengirim data saran sama sekali ke user FREE (lihat 5).
- **Ringkasan otomatis**: total harga jual (`SUM((harga asli + fee) × qty)`), total fee, total tagihan.
- **Status pembayaran**: Belum Lunas / DP / Lunas / Dikirim.
  - Jika status **DP**: muncul field input **Nominal DP** yang dibayarkan (`paidAmount`).
  - Jika status **Lunas/Dikirim**: `paidAmount` otomatis diisi = total tagihan.
- Simpan pesanan.

### 4.5 Invoice (Internal) — `/invoice/:eventId/:orderId`

- Halaman untuk jastiper — dilindungi auth.
- Termasuk fitur PRO `billing`. Datanya diambil lewat server function yang dijaga (`getOrderInvoice`), jadi user FREE ditolak walau URL-nya diketik langsung (lihat 5).
- Card invoice: nama brand/jastiper, no. invoice (8 karakter UUID), nama pelanggan, nama event, tanggal invoice, daftar item (qty × harga + fee), total tagihan.
- Info metode pembayaran aktif milik jastiper (bank, e-wallet, QRIS).
- Status pembayaran dengan badge warna.
- **Kirim ke WhatsApp**: input No. HP pelanggan (validasi format nomor Indonesia), tombol generate link `wa.me` dengan pesan dari **Template Chat WA** (lihat 4.8.5). Tombol ini cuma ada di halaman invoice, jadi otomatis ikut terkunci untuk paket FREE.
  - Jika pelanggan belum terdaftar di daftar Customer → muncul prompt untuk menambahkan.
- Tombol **Cetak** (`window.print()`).

### 4.6 Tagihan (Publik) — `/tagihan/:eventId/:orderId`

- Halaman publik tanpa auth — bisa dibagikan ke pelanggan lewat link.
- Termasuk fitur PRO `billing`, **dengan pengecualian (grandfathering)**: pesanan yang dibuat saat pemiliknya masih punya akses penuh (trial/PRO) tetap bisa dibuka walau sekarang paketnya FREE — link-nya sudah terlanjur dikirim ke pelanggan, jadi tidak boleh mati mendadak. Dicek lewat `hasFullAccessAtForUser(order.createdAt)` (lihat 5).
- Tampilan mirip Invoice internal tapi tanpa fitur kirim WA dan tanpa info internal.
- Menampilkan info pembayaran (bank/e-wallet/QRIS) milik jastiper jika pesanan **belum lunas**.
- Status pembayaran.
- Tombol **Cetak**.

### 4.7 Keuangan (Dashboard Global) — `/keuangan`

- 3 kartu: **Total pemasukan** (`SUM(paidAmount)` seluruh event), **Total modal keluar** (`SUM(originalPrice × qty)` pesanan lunas/dikirim), **Untung bersih** (`SUM(fee × qty)` pesanan lunas/dikirim).
- **Grafik pendapatan bulanan** (bar chart custom — hanya pesanan dengan status paid/shipped). Tap bar → tooltip nominal bulan tersebut.
- **Rincian per event**: card per event — nama event, tanggal, uang masuk, uang keluar, untung (warna aksen).

### 4.8 Profil — `/profil`

- Header: avatar inisial, nama, nama brand. Tap → modal **Edit Profil** (nama + nama brand).

#### 4.8.1 Section Langganan

- Baris status paket (ikon Crown) — teks "Paket Trial / FREE / PRO" + keterangan periode: sisa hari trial, batas aktif PRO, atau kapan masa trial berakhir (untuk FREE).
- Chip **Upgrade** tampil khusus paket FREE. Tap baris → halaman **Paket & Langganan** (lihat 4.12).

#### 4.8.2 Section Kelola

- **Manajemen Fee** → `/profil/fee-rules`
- **Customer** → `/profil/customers`
- (Master Control & Activity Logs disembunyikan sementara lewat flag `FEATURES.advancedMenu`.)

#### 4.8.3 Section Pembayaran

- List metode pembayaran aktif/nonaktif: bank, e-wallet, QRIS.
- Toggle aktif/nonaktif per metode.
- Tambah / edit / hapus metode pembayaran (modal `PaymentMethodModal`).
- Semua aksi **tulis** (tambah / edit / hapus / aktif-nonaktif) termasuk fitur PRO `payment_methods`: di paket FREE tombol "Tambah metode pembayaran" tampil terkunci + badge PRO, dan servernya menolak (`requireUserFeature('payment_methods')`). Daftar metodenya sendiri tetap bisa dibaca karena dipakai halaman tagihan pelanggan (lihat 5).
- Tipe yang didukung: `bank` (provider + no. rekening + nama pemilik), `wallet` (provider + no. HP), `qris` (upload gambar QRIS — disimpan sebagai base64 data URL).
- Metode aktif tampil di invoice/tagihan pelanggan.

#### 4.8.4 Section Keamanan

- **Ubah Kata Sandi** (modal `ChangePasswordModal`) — hanya muncul jika akun punya password (bukan login via Google saja).
- Akun Google-only menampilkan info statis bahwa kata sandi diatur dari akun Google.

#### 4.8.5 Section Preferensi

- **Mode gelap** — toggle, disimpan di `localStorage` + `data-theme` attribute.
- **Template Chat WA** (modal `MessageTemplateModal`) — template pesan WhatsApp untuk tagih pelanggan, dengan variabel `{customer}`, `{event}`, `{link}`, `{subtotal}`, `{fee}`, `{total}`, `{bank}`, `{bankAccount}`, `{brand}`. Bisa dikembalikan ke default.
- **Notifikasi** — placeholder (belum fungsional).
- **Tambahkan ke layar utama** — PWA install prompt (`beforeinstallprompt`); jika sudah terpasang, tombol berubah jadi "Terpasang di perangkat".

#### 4.8.6 Section Lainnya

- Bantuan (placeholder).
- Tentang aplikasi (versi `v1.0.0`).
- Tombol **Keluar** (logout).

### 4.9 Manajemen Fee — `/profil/fee-rules`

- List aturan fee: card per aturan — nama, jumlah tier, rentang harga, preview tier. Tombol "Tambah aturan fee".
- **Tambah / Edit Aturan Fee** — nama aturan + list tier (bisa tambah/hapus baris). Tiap tier: harga min, harga maks, fee jastip.
- **Saran tier otomatis** (dipakai di form Tambah **dan** Edit aturan fee) — dari harga dan fee barang yang pernah dicatat user, sistem mengelompokkan harga ke rentang (band) lalu menyarankan satu tier per rentang dengan fee = nilai tengah rentang tersebut (dibulatkan). Ini fitur PRO `fee_suggestions`: di paket FREE panel saran diganti keterangan "Saran tier otomatis dari riwayat harga & fee barang tersedia di paket PRO", dan server (`getFeeSuggestions`) cuma mengirim `unlocked: false` tanpa data (lihat 5.2).
- User bisa membuat **lebih dari satu aturan fee** (misal beda aturan untuk jastip lokal vs luar negeri).
- Di Detail Event, user memilih **satu Aturan Fee** yang berlaku untuk event tersebut.

**Contoh data nyata (referensi user, "Fee jastip by Mici"):**

| Rentang Harga     | Fee    |
| ----------------- | ------ |
| 1.000 – 19.900    | 4.000  |
| 20.000 – 39.900   | 6.000  |
| 40.000 – 69.900   | 8.000  |
| 70.000 – 99.900   | 10.000 |
| 100.000 – 199.000 | 13.000 |
| 200.000 – 299.000 | 23.000 |
| 300.000 – 399.000 | 25.000 |
| 400.000 – 499.000 | 30.000 |
| 500.000 – 799.000 | 40.000 |

**Validasi tier (wajib):**

- Tier baru tidak boleh **tumpang tindih** dengan tier lain dalam aturan yang sama.
- Rekomendasi: tier berikutnya harus mulai dari `tier_sebelumnya.max + 1`.
- Validasi dilakukan **real-time di form** (border merah + pesan error spesifik, tombol simpan disabled selama masih overlap) **dan divalidasi ulang di server** sebelum data disimpan.

### 4.10 Manajemen Customer — `/profil/customers`

- Daftar customer yang pernah ditambahkan oleh jastiper (soft delete via `deleted_at`).
- Data: nama, nomor HP (opsional).
- Autocomplete nama customer dipakai di form Tambah Pesanan.
- Tambah customer bisa dilakukan dari halaman Customer atau dari halaman Invoice saat nomor HP belum terdaftar.

### 4.11 Pesanan (Tab Global) — `/pesanan`

- **MVP: halaman dengan tulisan "Coming soon"** dan deskripsi singkat rencana ke depan.
- FAB tengah di bottom nav (tab "Tambah") mengarah ke `/pesanan/new` → redirect ke beranda dengan `?addOrder=true` (flow tambah pesanan cepat tanpa pilih event spesifik — belum diimplementasi penuh).

### 4.12 Paket & Langganan — `/profil/langganan`

- Halaman status langganan, dibuka dari baris **Langganan** di Profil. Punya header sendiri dengan tombol back (bottom nav tetap tampil di sini).
- **Kartu paket**: ikon Crown + teks "Paket Trial / FREE / PRO" + kalimat periode — "Sisa 12 hari (sampai 12 Februari 2026)" untuk trial, "Aktif sampai …" untuk PRO, "Masa trial berakhir …" untuk FREE — dilengkapi keterangan singkat masing-masing plan.
- **Daftar 4 fitur PRO** dengan status **Terbuka / Terkunci** per fitur (ikon centang vs gembok) + deskripsi singkat tiap fitur.
- **Cara upgrade ke PRO** (muncul kalau belum PRO): hubungi admin → bayar sesuai nominal paket (transfer manual) → kirim bukti transfer; setelah diverifikasi admin, status PRO aktif dan fitur terkunci otomatis terbuka.
- Halaman ini **hanya menampilkan** hasil entitlement dari server (`fetchCurrentUser`) — tidak ada perhitungan plan di client.
- Pengajuan upgrade dari dalam aplikasi (upload bukti transfer) + panel verifikasi admin **belum ada** — lihat 9.

## 5. Paket & Entitlement (Trial / FREE / PRO)

Tiga status akses. Seluruh aturannya ditulis di `src/lib/subscription.ts` (modul murni tanpa `db`, jadi dipakai bersama server & client) dan dihitung ulang setiap kali dibutuhkan.

| Plan  | Cara dapat                                                                    | Akses fitur                            |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Trial | Otomatis, 30 hari sejak user dibuat (`TRIAL_DAYS`)                            | Semua fitur terbuka                    |
| FREE  | Otomatis setelah trial habis (atau setelah masa PRO habis)                    | Fitur dasar saja, 4 fitur PRO terkunci |
| PRO   | Langganan 30 hari (`PRO_DURATION_DAYS`) yang pembayarannya diverifikasi admin | Semua fitur terbuka                    |

### 5.1 Cara status dihitung

- **Tidak ada kolom `users.is_pro`.** Status dihitung dari dua sumber: (1) kolom `users.trial_started_at` + `users.trial_ends_at` untuk masa trial, (2) histori tabel `subscriptions` — baris `status = 'active'` yang `ends_at`-nya belum lewat berarti PRO.
- Prioritas: **PRO aktif > trial belum habis > FREE** (fungsi `resolveEntitlement`).
- Nilai trial diisi **DEFAULT kolom di database**, bukan diset di kode, supaya semua jalur pembuatan user (register email, Google OAuth, seed) otomatis kebagian trial yang sama.
- Aturan buka/tutup fitur ditulis **satu kali** di `featuresForPlan(plan)`: `plan !== 'free'` → semua fitur PRO terbuka. Fungsi inilah yang dibaca server & client, jadi tidak ada lagi pengecekan `isPro` yang tersebar sendiri-sendiri.
- Entitlement yang dikirim ke client (lewat `fetchCurrentUser`) berisi: `plan`, `isTrial`, `isPro`, `proUntil`, `trialStartedAt`, `trialEndsAt`, `trialDaysLeft`, dan `features` (satu flag per fitur PRO).

### 5.2 Daftar fitur PRO (kunci + gerbang server)

| Kunci fitur         | Fitur                                                              | Gerbang server                                                                                                                          |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `billing`           | Tagih: halaman invoice internal, kirim WA, dan link tagihan publik | `requireFeature(getUserEntitlements(user), 'billing')` di `getOrderInvoice`; di `getPublicOrderInvoice` ada aturan grandfathering (5.5) |
| `payment_methods`   | Tambah / edit / hapus / aktif-nonaktif metode pembayaran           | `requireUserFeature('payment_methods')` di 4 server function tulis — baca daftar tetap terbuka                                          |
| `order_suggestions` | Saran nama barang & harga asli di form Tambah/Edit Pesanan         | `getOrderSuggestions` mengembalikan `unlocked: false` + data kosong (tidak melempar error)                                              |
| `fee_suggestions`   | Saran tier aturan fee di form Tambah/Edit Aturan Fee               | `getFeeSuggestions` mengembalikan `unlocked: false` + data kosong                                                                       |

Label & deskripsi tiap kunci (`PRO_FEATURE_INFO`), label/deskripsi plan (`PLAN_INFO`, `planLabel()`), dan pesan seragam `featureLockedMessage()` juga tinggal di `src/lib/subscription.ts` — jadi teks UI dan pesan server tidak bisa beda.

### 5.3 Gerbang server (yang mengikat)

- Pintu masuknya `src/lib/entitlements.ts`: `getUserEntitlements(user)` (hitung status) → `requireFeature()` / `requireUserFeature()` yang melempar `FeatureLockedError` (`code = 'FEATURE_LOCKED'`, pesannya siap ditampilkan) kalau fiturnya terkunci.
- Server function **tidak boleh** menulis `plan === 'pro'` sendiri; selalu lewat helper di atas.
- Endpoint saran (`order_suggestions`, `fee_suggestions`) sengaja **tidak melempar error**, tapi mengembalikan `unlocked: false` + data kosong supaya halaman tetap bisa dirender dan UI-nya cukup menampilkan status terkunci. Yang penting: server tidak pernah mengirim data saran ke user FREE.
- Karena pengecekannya di server, UI yang diakali (memanggil endpoint langsung) tetap ditolak.

### 5.4 Perilaku UI saat fitur terkunci

- `ProBadge` — penanda kecil "PRO" pada kontrol yang terkunci.
- `ProLockPrompt` — dialog seragam untuk fitur terkunci: penjelasan fiturnya, isi paket PRO, status plan user saat ini, lalu tombol **"Upgrade ke PRO"** (menuju `/profil/langganan`) dan "Nanti saja".
- Kontrol yang tampil terkunci di paket FREE: tombol **Tagih** di Detail Event (gembok + badge PRO; klik = dialog upgrade), tombol "Tambah metode pembayaran" serta toggle aktif-nonaktif metode (semua aksi tulis dialihkan ke dialog upgrade), lalu keterangan pengganti saran di form pesanan ("Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO") dan di form aturan fee ("Saran tier otomatis dari riwayat harga & fee barang tersedia di paket PRO").
- Baris **Langganan** di Profil menampilkan status paket + chip **Upgrade** (khusus FREE) sebagai jalan masuk ke halaman Paket & Langganan.
- Semua kunci di UI dibaca dari `canUseFeature(entitlements, '<kunci fitur>')` — komponen tidak menghitung status plan sendiri.

### 5.5 Grandfathering (agar tidak merusak data yang sudah beredar)

- Link tagihan publik (`/tagihan/:eventId/:orderId`) untuk pesanan yang dibuat saat pemiliknya masih punya akses penuh **tetap bisa dibuka** walau sekarang paketnya FREE — dicek dengan `hasFullAccessAtForUser(owner, order.createdAt)`. Alasannya link itu sudah terlanjur dikirim ke pelanggan lewat WhatsApp.
- Ringkasnya: **akses sekarang** menentukan boleh-tidaknya membuat/membuka invoice baru; **akses saat pesanan dibuat** dipakai untuk menoleransi link lama.

### 5.6 Aktivasi PRO (kondisi sekarang)

- Pembayaran **manual** (transfer), verifikasi oleh **admin**.
- Tabel `subscriptions` sudah menyiapkan semuanya: durasi (`duration_days`), periode PRO (`started_at` / `ends_at`), info pembayaran (nominal, metode, provider, nama pengirim, referensi transfer, bukti transfer, tanggal bayar, catatan), plus kolom hasil review admin (`reviewed_by`, `reviewed_at`, `review_note`).
- Maksimal **satu baris `pending` per user** (unique index `subscriptions_pending_per_user_unique`), jadi bukti transfer tidak bisa dikirim dobel sebelum yang lama diproses.
- Helper yang sudah siap dipakai fase pengajuan/verifikasi: `nextProWindow()` (perpanjangan menambah dari `ends_at` yang masih aktif, bukan dari hari ini), `listSubscriptions()`, `findPendingSubscription()`, `getSubscriptionState()`.
- Yang **belum** dibangun: form pengajuan upgrade dari dalam aplikasi + panel verifikasi admin (lihat 9).

## 6. Navigasi

Bottom tab bar (5 slot), fixed, dengan `padding-bottom: env(safe-area-inset-bottom)` untuk safe area. Max width 480px.

| Icon          | Tab                    | Route          | Isi                                   |
| ------------- | ---------------------- | -------------- | ------------------------------------- |
| 🏠 Home       | Beranda                | `/`            | List event aktif + ringkasan keuangan |
| 💰 Wallet     | Keuangan               | `/keuangan`    | Dashboard keuangan global             |
| ➕ Plus (FAB) | Tambah (FAB, menonjol) | `/pesanan/new` | Quick add pesanan                     |
| 📋 List       | Pesanan                | `/pesanan`     | Coming soon                           |
| 👤 User       | Profil                 | `/profil`      | Settings & akses ke fitur sekunder    |

Halaman detail (Detail Event, Fee Rules, Customers, Invoice) menyembunyikan bottom nav dan menggunakan header dengan tombol back. Path prefix yang menyembunyikan bottom nav: `/events/`, `/profil/fee-rules`, `/profil/customers`, `/invoice/`.

## 7. Skema Database

```sql
-- USERS & AUTH
users
  id                uuid primary key
  name              varchar NOT NULL
  brand_name        varchar (nullable)
  wa_message_template text (nullable)    -- template chat WA kustom
  email             varchar unique NOT NULL
  password_hash     varchar (nullable)   -- null jika login via Google saja
  google_id         varchar unique (nullable)
  trial_started_at  timestamp NOT NULL default now()                    -- awal masa trial
  trial_ends_at     timestamp NOT NULL default now() + interval '30 days' -- akhir masa trial (TRIAL_DAYS)
  created_at        timestamp
  updated_at        timestamp
  -- constraint: trial_ends_at >= trial_started_at

sessions
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  token             varchar unique NOT NULL
  expires_at        timestamp NOT NULL
  created_at        timestamp

password_reset_tokens
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  token_hash        varchar unique NOT NULL  -- SHA-256 hash dari token mentah
  expires_at        timestamp NOT NULL
  used_at           timestamp (nullable)     -- diisi saat token dipakai/hangus
  created_at        timestamp

-- SUBSCRIPTIONS (histori langganan PRO — pembayaran manual, diverifikasi admin)
subscriptions
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  plan_code         varchar NOT NULL default 'pro'      -- PRO_PLAN_CODE
  status            enum('pending','active','expired','rejected') NOT NULL default 'pending'
  duration_days     integer NOT NULL default 30         -- PRO_DURATION_DAYS
  started_at        timestamp (nullable)  -- diisi saat status jadi 'active'
  ends_at           timestamp (nullable)  -- akhir masa PRO (dasar resolveEntitlement)
  -- info pembayaran (diisi user saat mengajukan)
  amount              decimal(12,2) NOT NULL default 0
  payment_method      enum('bank','wallet','qris') (nullable)
  payment_provider    varchar (nullable)  -- "BCA", "GoPay"
  payment_sender_name varchar (nullable)  -- nama pengirim, buat dicocokkan admin
  payment_reference   varchar (nullable)  -- no. referensi / 4 digit terakhir
  payment_proof_image text (nullable)     -- bukti transfer (data URL base64)
  payment_note        text (nullable)
  paid_at             timestamp (nullable)  -- tanggal user mengaku transfer
  -- hasil verifikasi manual admin (diisi di fase admin)
  reviewed_by       uuid → users.id (set null on delete) (nullable)
  reviewed_at       timestamp (nullable)
  review_note       text (nullable)
  created_at        timestamp
  updated_at        timestamp
  -- index: (user_id, created_at), status
  -- unique: maksimal satu baris `pending` per user
  -- constraint: amount >= 0; ends_at >= started_at (kalau keduanya terisi)

-- FEE RULES (Manajemen Fee)
fee_rules
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  name              varchar NOT NULL
  created_at        timestamp
  updated_at        timestamp

fee_tiers
  id                uuid primary key
  fee_rule_id       uuid → fee_rules.id (cascade delete)
  min_price         decimal(12,2) NOT NULL
  max_price         decimal(12,2) NOT NULL
  fee_amount        decimal(12,2) NOT NULL
  created_at        timestamp
  -- constraint: tidak boleh overlap antar tier dalam fee_rule yang sama
  -- divalidasi di application layer + server sebelum insert/update

-- CUSTOMERS
customers
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  name              varchar NOT NULL
  phone             varchar (nullable)
  created_at        timestamp
  updated_at        timestamp
  deleted_at        timestamp (nullable)  -- soft delete

-- PAYMENT METHODS
payment_methods
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  type              enum('bank','wallet','qris') NOT NULL
  provider          varchar NOT NULL        -- "BCA", "GoPay", "QRIS"
  account_number    varchar (nullable)      -- no. rekening / no. HP wallet
  account_name      varchar (nullable)      -- atas nama (opsional)
  qris_image        text (nullable)         -- data URL base64 (image/png|jpeg|webp)
  is_active         boolean NOT NULL default true
  created_at        timestamp
  updated_at        timestamp

-- EVENTS
events
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  fee_rule_id       uuid → fee_rules.id (set null on delete) (nullable)
  name              varchar NOT NULL
  description       text (nullable)
  event_date        date NOT NULL
  created_at        timestamp
  updated_at        timestamp

-- ORDERS & ITEMS
orders
  id                uuid primary key
  event_id          uuid → events.id (cascade delete)
  customer_name     varchar NOT NULL
  customer_phone    varchar (nullable)
  payment_status    enum('unpaid','dp','paid','shipped') NOT NULL default 'unpaid'
  paid_amount       decimal(12,2) NOT NULL default 0  -- nominal yang sudah dibayar (DP support)
  created_at        timestamp
  updated_at        timestamp

items
  id                uuid primary key
  order_id          uuid → orders.id (cascade delete)
  name              varchar NOT NULL
  original_price    decimal(12,2) NOT NULL
  fee               decimal(12,2) NOT NULL  -- fee berlaku PER UNIT (per qty)
  qty               integer NOT NULL default 1
  obtained          boolean NOT NULL default false  -- checklist live shopping
  created_at        timestamp

-- ACTIVITY LOGS
activity_logs
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  action            varchar NOT NULL
  entity_type       varchar NOT NULL
  entity_id         uuid NOT NULL
  metadata          jsonb (nullable)
  created_at        timestamp
```

### Catatan penting skema

- **Isolasi multi-tenant**: setiap query ke `events` dan `fee_rules` difilter langsung via `user_id`. Query ke `orders` difilter via join ke `events.user_id`, dan `items` via join ke `orders → events.user_id`.
- **Fee disimpan di `items`, bukan dihitung ulang** — supaya histori transaksi tidak berubah kalau `fee_tiers` diedit/dihapus di kemudian hari.
- **Status `dp`**: pesanan bisa berstatus DP dengan `paid_amount` yang diisi sebagian dari total tagihan. Sisa tagihan = `total - paid_amount`.
- **`obtained` di `items`**: dipakai untuk checklist live shopping — menandai barang sudah didapat di toko.
- **`password_hash` nullable**: user yang hanya mendaftar via Google tidak punya password; tampilan Profil menyesuaikan.
- **`wa_message_template` di `users`**: template default ada di `src/lib/message-template.ts`. Jika null, dipakai template default.
- **Status langganan tidak disimpan sebagai flag**: tidak ada kolom `users.is_pro`. Masa trial ada di `users.trial_started_at` / `users.trial_ends_at`, sedangkan status PRO dihitung dari baris `subscriptions` berstatus `active` yang `ends_at`-nya belum lewat (lihat 5.1).
- **`subscriptions` bersifat histori, bukan state**: satu baris = satu pengajuan/pembelian. Perpanjangan membuat baris baru (baris lama jadi `expired`), jadi riwayat pembayaran selalu bisa diaudit.
- **Kolom `payment_*` di `subscriptions`**: info pembayaran disimpan di tabel yang sama supaya admin bisa mencocokkan transfer tanpa tabel tambahan. Bukti transfer memakai pola yang sama dengan `payment_methods.qris_image` (data URL base64).
- **Default trial ada di level database**: `trial_started_at DEFAULT now()` dan `trial_ends_at DEFAULT now() + interval '30 days'` — semua jalur pembuatan user otomatis kebagian trial. Migrasi `0001_curious_blade.sql` membackfill user lama dengan aturan "trial mulai saat user dibuat" (`trial_started_at = created_at`), dan `pnpm db:backfill-trial` dipakai kalau pemilik aplikasi mau mengecualikan user lama (mis. trial 30 hari mulai hari rilis).

### Logika auto-fill fee

```
1. User memilih fee_rule_id di level event.
2. Saat input item baru, ambil original_price.
3. Query: SELECT fee_amount FROM fee_tiers
   WHERE fee_rule_id = event.fee_rule_id
   AND original_price BETWEEN min_price AND max_price
4. Jika ketemu → auto-fill field fee.
5. Jika tidak ketemu (harga di luar semua tier) → field fee dikosongkan,
   diisi manual oleh user.
```

### Logika dashboard keuangan

- **Uang masuk** = `SUM(paidAmount)` dari seluruh orders milik user (termasuk DP).
- **Outstanding / Belum bayar** = `SUM(MAX(total_tagihan - paidAmount, 0))` per order.
- **Total modal keluar** = `SUM(originalPrice × qty)` dari items yang order-nya berstatus `paid` atau `shipped`.
- **Untung bersih** = `SUM(fee × qty)` dari items yang order-nya berstatus `paid` atau `shipped`.
- **Pendapatan bulanan** (grafik) = `SUM((originalPrice + fee) × qty)` per bulan, hanya dari orders berstatus `paid` atau `shipped`.
- Status `shipped` diperlakukan setara `paid` untuk kalkulasi keuangan — menandai pesanan yang sudah dibayar dan barangnya sudah dikirim ke pelanggan.

## 8. Struktur File Utama

```
src/
├── components/           # Komponen UI reusable
│   ├── AddOrderSheet.tsx       # Bottom sheet tambah/edit pesanan
│   ├── BottomNav.tsx           # Bottom tab navigation
│   ├── ChangePasswordModal.tsx
│   ├── CustomerFormModal.tsx
│   ├── EditProfileModal.tsx
│   ├── FeeRuleForm.tsx         # Form tambah/edit aturan fee + tier
│   ├── MessageTemplateModal.tsx
│   ├── PaymentInfoCard.tsx     # Info metode pembayaran di invoice
│   ├── PaymentMethodModal.tsx
│   ├── ProBadge.tsx            # Badge "PRO" untuk kontrol yang terkunci
│   ├── ProLockPrompt.tsx       # Dialog fitur terkunci + tombol upgrade
│   ├── ThemeToggle.tsx
│   └── ui/                    # Komponen primitif (Switch, ConfirmModal, dll)
├── db/
│   ├── index.ts               # Koneksi Drizzle + pg
│   └── schema.ts              # Definisi semua tabel & relasi (termasuk subscriptions)
├── lib/                  # Server functions (createServerFn)
│   ├── auth.ts                # getSessionUser, session management
│   ├── auth-functions.ts      # login, register, logout, updateProfile, changePassword
│   ├── customers-functions.ts
│   ├── entitlements.ts        # getUserEntitlements, requireFeature/requireUserFeature (gerbang PRO)
│   ├── events-functions.ts    # listEvents, createEvent, updateEvent, deleteEvent, getEventDetail
│   ├── fee-rules-functions.ts
│   ├── fee-suggestions.ts     # Hitung saran tier fee (murni, tanpa db)
│   ├── fee-suggestions-functions.ts  # getFeeSuggestions (gerbang fee_suggestions)
│   ├── fee-tier-validation.ts # Validasi overlap tier (dipakai client & server)
│   ├── finance-functions.ts   # getFinanceSummary
│   ├── format.ts              # formatPhoneNumber, formatDate, buildWhatsAppLink, isValidIndonesianPhone
│   ├── google-auth.ts         # buildGoogleAuthUrl, exchangeGoogleCode
│   ├── mailer.ts              # Kirim email reset password
│   ├── message-template.ts    # DEFAULT_WA_MESSAGE_TEMPLATE, renderMessageTemplate
│   ├── message-template-functions.ts
│   ├── order-suggestions-functions.ts  # getOrderSuggestions (gerbang order_suggestions)
│   ├── order-totals.ts        # lineTotal, summarizeItems
│   ├── orders-functions.ts    # CRUD order & item, invoice, updateItemsObtained (+ gate billing)
│   ├── password-reset-functions.ts
│   ├── password-reset-mail.ts
│   ├── payment-methods-functions.ts  # CRUD metode pembayaran (+ gate payment_methods)
│   ├── subscription.ts        # Aturan trial/FREE/PRO, PRO_FEATURES, PLAN_INFO (murni)
│   ├── subscription.test.ts   # Unit test aturan plan & entitlement
│   └── subscription-queries.ts # Baca histori & pengajuan subscription (server)
├── routes/
│   ├── __root.tsx             # Root layout (theme init, QueryClient provider)
│   ├── _app.tsx               # Auth-protected layout (session check + BottomNav)
│   ├── _app/
│   │   ├── index.tsx          # Beranda
│   │   ├── keuangan.tsx       # Dashboard keuangan
│   │   ├── events.$eventId.tsx  # Detail event (accordion customer + checklist barang)
│   │   ├── events.new.tsx     # Form buat event baru
│   │   ├── invoice.$eventId.$orderId.tsx  # Invoice internal (auth)
│   │   ├── pesanan/
│   │   │   ├── index.tsx      # Coming soon
│   │   │   └── new.tsx        # Redirect ke beranda + ?addOrder=true
│   │   └── profil/
│   │       ├── index.tsx      # Halaman profil
│   │       ├── langganan.tsx  # Paket & Langganan (status trial/FREE/PRO)
│   │       ├── customers/index.tsx
│   │       ├── fee-rules/index.tsx
│   │       ├── fee-rules/new.tsx
│   │       └── fee-rules/$feeRuleId.tsx
│   ├── api/auth/google/
│   │   ├── index.ts           # Redirect ke Google OAuth
│   │   └── callback.ts        # Callback Google OAuth
│   ├── login.tsx
│   ├── register.tsx
│   ├── lupa-sandi.tsx
│   ├── reset-sandi.$token.tsx
│   └── tagihan.$eventId.$orderId.tsx  # Invoice publik (tanpa auth)
└── styles.css                 # CSS variables + Tailwind directives
```

## 9. Di Luar Cakupan MVP (Next Phase)

- Tab Pesanan (list & filter lintas event).
- **Pengajuan upgrade PRO dari dalam aplikasi** — form upload bukti transfer + riwayat langganan di `/profil/langganan`. Skema `subscriptions` dan helper `nextProWindow()` / `getSubscriptionState()` sudah siap; sekarang aktivasi masih dikerjakan manual oleh admin (lihat 5.6).
- **Panel admin verifikasi pembayaran** (`reviewed_by`, `reviewed_at`, `review_note`) — termasuk penetapan harga paket & durasi. Durasi saat ini konstanta `PRO_DURATION_DAYS` (30 hari).
- Reminder otomatis ke pelanggan yang belum lunas (WhatsApp API / bot).
- Payment gateway (pembayaran online) — untuk MVP masih manual/transfer.
- Verifikasi email saat register.
- Aplikasi mobile native — MVP web/PWA saja.
- Import Excel / Ekspor Data.
- Master Control & Activity Logs (sudah ada di DB tapi UI disembunyikan via `FEATURES.advancedMenu`).
- Notifikasi push (service worker sudah ada via Workbox, tapi belum diimplementasi).
