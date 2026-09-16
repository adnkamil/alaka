# PRD — Aplikasi Jastip (PWA)

## 1. Ringkasan Produk

Aplikasi manajemen jastip (titip beli) berbasis web, mobile-first, dan bisa
diinstall sebagai PWA. Ditujukan untuk jastiper yang saat ini mengelola
pesanan secara manual (spreadsheet/chat), agar bisa mengelola event belanja,
pesanan pelanggan, dan keuangan dalam satu tempat.

Aplikasi bersifat **multi-tenant** — siapa saja bisa mendaftar dan setiap
user memiliki data (event, pesanan, aturan fee) yang terisolasi dari user
lain. Semua user memiliki role yang sama sebagai jastiper (tidak ada role
customer terpisah).

## 2. Referensi

Riset awal dilakukan terhadap aplikasi sejenis "JasTip.Nya by Afathya"
(jastipnya-afathya.netlify.app) — versi desktop dengan sidebar navigation.
Konsep inti (Event → Order per customer → Item) diadaptasi dari sana, lalu
didesain ulang mobile-first dengan bottom tab navigation (terinspirasi dari
Astra Otoshop).

## 3. Tech Stack

| Layer               | Pilihan                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Framework           | TanStack Start (React + Vite)                                                                |
| Routing             | TanStack Router                                                                              |
| Data fetching/cache | TanStack Query                                                                               |
| Styling             | Tailwind CSS (mobile-first)                                                                  |
| PWA                 | vite-plugin-pwa                                                                              |
| Database            | PostgreSQL                                                                                   |
| Auth                | Session-based, cookie httpOnly (mis. Lucia / iron-session), password di-hash (bcrypt/argon2) |

## 4. Fitur & Halaman

### 4.1 Autentikasi

- **Register** — nama, nama brand jastip (opsional), email, password + konfirmasi. Self-service, langsung aktif tanpa verifikasi email (untuk MVP).
- **Login** — email + password, opsi "Ingat saya".
- Route protection: layout `_app` melakukan `beforeLoad` cek session, redirect ke `/login` jika belum login. Bottom nav tab **tidak muncul** di halaman login/register.

### 4.2 Beranda

- Ringkasan keuangan singkat (uang masuk, belum bayar).
- List event aktif (card: nama, tanggal, jumlah pesanan).
- Tap card → masuk ke Detail Event.

### 4.3 Detail Event

- Header: nama event, tanggal, menu (edit/hapus).
- Ringkasan keuangan event: uang masuk, outstanding, estimasi untung bersih.
- **Dropdown pilih Aturan Fee** untuk event ini (lihat 4.6).
- Search pelanggan.
- List pesanan dikelompokkan per customer (accordion), badge status Belum Lunas/Lunas/Dikirim.
- Expand customer → list item + aksi (Receipt, Tambah, Hapus).
- Floating action button (+) → buka form Tambah Pesanan.

### 4.4 Tambah Pesanan (bottom sheet)

- Context: event terkait (chip, non-editable).
- Nama pelanggan (teks bebas, bukan akun).
- Barang titipan — repeatable block: nama barang, harga asli, jumlah (qty), fee jastip.
  - **Fee auto-terisi** berdasarkan Aturan Fee event ini + harga barang yang diinput (lihat 4.6). Bila harga di luar semua tier, field fee dikosongkan untuk diisi manual.
  - **Fee berlaku per unit**: total satu barang = `(harga asli + fee) × qty`. Contoh: barang 30.000 + fee 4.000, qty 2 → (30.000 + 4.000) × 2 = 68.000.
- Ringkasan otomatis: total harga jual (`SUM(harga asli × qty)`), total fee (`SUM(fee × qty)`), total tagihan.
- Status pembayaran (Lunas/Belum Lunas).
- Simpan pesanan.

### 4.5 Keuangan (dashboard global)

- 3 kartu: Total pemasukan, Total modal keluar, Untung bersih.
- Grafik pendapatan bulanan (bar chart, hanya pesanan lunas).
- Rincian keuangan per event (stacked card: nama event, untung, masuk, keluar).

### 4.6 Manajemen Fee

Mengelola aturan fee jastip berbasis tier harga produk, agar kolom Fee
Jastip di form Tambah Pesanan bisa otomatis terisi.

- **List Manajemen Fee** — card per aturan: nama, jumlah tier, rentang harga, preview tier. Tombol "Tambah aturan fee".
- **Tambah/Edit Aturan Fee** — nama aturan + list tier (bisa tambah/hapus baris). Tiap tier: harga min, harga maks, fee jastip.
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

- Tier baru tidak boleh **tumpang tindih** dengan tier lain dalam aturan yang sama (contoh kasus: `1.000–10.000` vs `10.000–20.000` sama-sama mencakup harga 10.000 → ambigu, harus ditolak).
- Rekomendasi: tier berikutnya harus mulai dari `tier_sebelumnya.max + 1`.
- Validasi dilakukan **real-time di form** (border merah + pesan error spesifik, tombol simpan disabled selama masih overlap) **dan divalidasi ulang di server** sebelum data disimpan (jaga-jaga ada input dari luar form, misal import Excel di masa depan).

### 4.7 Pesanan (tab global)

- **MVP: halaman kosong dengan tulisan "Coming soon".**
- Rencana ke depan: daftar semua pesanan lintas event, filter status (misal semua yang belum lunas), search tanpa perlu tahu event-nya, dasar untuk fitur reminder pembayaran.

### 4.8 Profil

- Header: avatar, nama, nama brand.
- Section **Kelola**: Manajemen Fee, Customer. (Master Control & Activity Logs
  disembunyikan sementara lewat flag `FEATURES.advancedMenu` di halaman Profil.)
- Section **Preferensi**: Mode Gelap, Notifikasi, "Tambahkan ke layar utama" (PWA install prompt).
- Section **Lainnya**: Bantuan, Tentang aplikasi (versi).
- Tombol Keluar (logout).

## 5. Navigasi

Bottom tab bar (5 slot), fixed, dengan `padding-bottom: env(safe-area-inset-bottom)` untuk safe area:

| Icon | Tab                    | Isi                                |
| ---- | ---------------------- | ---------------------------------- |
| 🏠   | Beranda                | List event aktif                   |
| 📊   | Keuangan               | Dashboard keuangan global          |
| ➕   | Tambah (FAB, menonjol) | Quick add pesanan                  |
| 📋   | Pesanan                | Coming soon                        |
| 👤   | Profil                 | Settings & akses ke fitur sekunder |

Halaman detail (Detail Event, Tambah Pesanan, dll) menyembunyikan bottom
nav dan menggunakan header dengan tombol back.

## 6. Skema Database

```sql
-- USERS & AUTH
users
  id                uuid primary key
  name              varchar
  brand_name        varchar (nullable)
  email             varchar unique
  password_hash     varchar
  created_at        timestamp
  updated_at        timestamp

sessions
  id                uuid primary key
  user_id           uuid → users.id
  token             varchar unique
  expires_at        timestamp
  created_at        timestamp

-- FEE RULES (Manajemen Fee)
fee_rules
  id                uuid primary key
  user_id           uuid → users.id
  name              varchar
  created_at        timestamp
  updated_at        timestamp

fee_tiers
  id                uuid primary key
  fee_rule_id       uuid → fee_rules.id
  min_price         decimal
  max_price         decimal
  fee_amount        decimal
  created_at        timestamp
  -- constraint: (fee_rule_id, min_price, max_price) tidak boleh overlap
  -- divalidasi di application layer + server sebelum insert/update

-- EVENTS
events
  id                uuid primary key
  user_id           uuid → users.id
  fee_rule_id       uuid → fee_rules.id (nullable)
  name              varchar
  description       text (nullable)
  event_date        date
  created_at        timestamp
  updated_at        timestamp

-- ORDERS & ITEMS
orders
  id                uuid primary key
  event_id          uuid → events.id
  customer_name     varchar
  payment_status    enum('unpaid','paid','shipped')
  created_at        timestamp
  updated_at        timestamp

items
  id                uuid primary key
  order_id          uuid → orders.id
  name              varchar
  original_price    decimal
  fee               decimal  -- fee berlaku PER UNIT (per qty)
  qty               integer default 1
  created_at        timestamp

-- ACTIVITY LOGS
activity_logs
  id                uuid primary key
  user_id           uuid → users.id
  action            varchar
  entity_type       varchar
  entity_id         uuid
  metadata          jsonb (nullable)
  created_at        timestamp
```

### Catatan penting skema

- **Isolasi multi-tenant**: setiap query ke `events` dan `fee_rules` difilter
  langsung via `user_id`. Query ke `orders` difilter via join ke
  `events.user_id`, dan `items` via join ke `orders → events.user_id`.
- **Fee disimpan di `items`, bukan dihitung ulang** — supaya histori
  transaksi tidak berubah kalau `fee_tiers` diedit/dihapus di kemudian hari.

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

- **Uang masuk** = `SUM((original_price + fee) × qty)` dari items yang order-nya
  `payment_status IN ('paid', 'shipped')`.
- **Outstanding** = sama seperti di atas tapi `payment_status = 'unpaid'`.
- Status `shipped` ("Dikirim") diperlakukan setara `paid` untuk perhitungan
  keuangan — dipakai untuk menandai pesanan yang sudah dibayar dan barangnya
  sudah dikirim ke pelanggan.
- **Modal keluar** = `SUM(original_price × qty)` dari items yang sudah dibayar.
- **Untung bersih** = `SUM(fee × qty)` dari seluruh items (fee jastip =
  keuntungan jastiper).

## 7. Di Luar Cakupan MVP (Next Phase)

- Tab Pesanan (list & filter lintas event).
- Payment gateway (pembayaran online) — untuk MVP masih manual/transfer.
- Aplikasi mobile native — MVP web/PWA saja.
- Verifikasi email saat register.
- Reminder otomatis ke pelanggan yang belum lunas (kemungkinan terhubung ke WhatsApp).
- Import Excel / Ekspor Data (ada di aplikasi referensi, belum diprioritaskan di MVP ini).