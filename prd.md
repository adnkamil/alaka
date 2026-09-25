# PRD — Aplikasi Jastip Mici (PWA)

## 1. Ringkasan Produk

Aplikasi manajemen jastip (titip beli) berbasis web, mobile-first, dan bisa
diinstall sebagai PWA. Ditujukan untuk jastiper yang saat ini mengelola
pesanan secara manual (spreadsheet/chat), agar bisa mengelola event belanja,
pesanan pelanggan, dan keuangan dalam satu tempat.

Aplikasi bersifat **multi-tenant** — siapa saja bisa mendaftar dan setiap
user memiliki data (event, pesanan, aturan fee) yang terisolasi dari user
lain. Semua user memiliki role yang sama sebagai jastiper (tidak ada role
customer terpisah), dengan satu pengecualian: **admin** — ditandai kolom
`users.is_admin` (default `false`, diaktifkan manual lewat DB) — yang punya
dashboard sendiri di `/admin` untuk mengatur harga & QRIS pembayaran PRO
serta memverifikasi pengajuan langganan (lihat 4.13).

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

| Layer               | Pilihan                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | TanStack Start (React 19 + Vite 8)                                                                                               |
| Routing             | TanStack Router                                                                                                                  |
| Data fetching/cache | TanStack Query                                                                                                                   |
| Styling             | Tailwind CSS v4 (mobile-first)                                                                                                   |
| PWA                 | vite-plugin-pwa + Workbox (custom service worker)                                                                                |
| Database            | PostgreSQL via Drizzle ORM — perubahan skema **wajib lewat migrasi** (`db:generate` + `db:migrate`), bukan `db:push` (lihat 7.1) |
| Auth                | Session-based, cookie httpOnly; password di-hash (bcryptjs)                                                                      |
| OAuth               | Google OAuth 2.0 (OpenID Connect — login/register via Google)                                                                    |
| Validasi            | Zod (client & server)                                                                                                            |
| Testing             | `node:test` (dijalankan via `tsx --test`, lihat `npm test`)                                                                      |
| Icons               | Lucide React                                                                                                                     |

## 4. Fitur & Halaman

### 4.1 Autentikasi

- **Register** — nama, nama brand jastip (opsional), email, password + konfirmasi. Self-service, langsung aktif tanpa verifikasi email (untuk MVP).
- **Login** — email + password, opsi "Ingat saya". Atau **login/register via Google** (Google OAuth 2.0, route `/api/auth/google` + `/api/auth/google/callback`).
- **Lupa Sandi** (`/lupa-sandi`) — user masukkan email, terima link reset via email (mailer).
- **Reset Sandi** (`/reset-sandi/:token`) — halaman ganti password via token sekali pakai (SHA-256 hash, ada `expires_at` + `used_at`).
- Route protection: layout `_app` melakukan `beforeLoad` cek session, redirect ke `/login` jika belum login. Bottom nav tab **tidak muncul** di halaman login/register.

### 4.2 Beranda

- Ringkasan keuangan singkat (2 kartu: **Uang masuk** = total `paidAmount` seluruh event; **Belum bayar** = sisa tagihan semua pesanan yang belum lunas). Kedua angka ini menghitung **semua** event termasuk yang nonaktif — event ditutup bukan berarti uangnya hilang dari catatan.
- List **Event aktif** milik user (diurutkan terbaru dulu): card berisi nama, tanggal (format `d MMM`), jumlah pesanan.
- Event yang **nonaktif** (lihat 4.3) dikeluarkan dari daftar itu dan dipindah ke bagian **Event nonaktif (n)** yang terlipat di bawahnya (buka-tutup), tiap card diberi badge "Nonaktif" dan tampil lebih redup. Datanya tidak dihapus, cuma tidak mengganggu daftar event yang masih jalan.
- Tap card → masuk ke Detail Event.
- Link **Tambah event** di pojok kanan atas.
- Avatar pengguna di header → link ke halaman Profil.

### 4.3 Detail Event (`/events/:eventId`)

- **Header**: tombol back, nama event (+ badge **Nonaktif** kalau event sudah ditutup), menu tiga titik berisi: pilih **Aturan Fee** event (lihat 4.9), toggle **Event aktif**, dan **Hapus event** (dengan konfirmasi).
- **Nonaktifkan event** (toggle di menu tiga titik) = menutup event tanpa menghapus data: muncul banner "Event ini nonaktif", tombol **+ (Tambah Pesanan)** disembunyikan, dan `createOrder` di server ikut menolak. Pesanan lama tetap bisa dibuka, diedit, dihapus, dan ditagih seperti biasa. Bisa diaktifkan lagi kapan saja.
- **Hapus event**: konfirmasi menyebut jumlah pesanan yang ikut terhapus (FK `orders` → `events` dan `items` → `orders` pakai `ON DELETE CASCADE`), sekaligus menyarankan pakai **nonaktifkan** kalau cuma mau menutup event. Setelah terhapus, user dibalikkan ke Beranda.
- **Ringkasan keuangan event**: uang masuk, outstanding, estimasi untung bersih.
- **Dropdown pilih Aturan Fee** untuk event ini (lihat 4.9).
- **Search/filter pelanggan** (filter real-time berdasarkan nama customer).
- **View toggle**: mode "Per Pelanggan" (accordion customer) dan mode "Ringkasan Barang" (lihat 4.3.1).
- List pesanan dikelompokkan per customer (accordion), badge status **Belum Lunas / DP / Lunas / Dikirim**.
- Expand customer → list item + tombol aksi: **Tagih** (→ invoice internal; fitur PRO — di paket FREE tombolnya berubah jadi ikon gembok + badge PRO, dan klik-nya hanya memunculkan dialog upgrade, bukan halaman tagih. Lihat 5), **Tambah**, **Hapus**, **Edit status**.
- **Floating action button (+)** → buka form Tambah Pesanan (disembunyikan kalau event nonaktif).
- Kalau pesanan yang baru disimpan barangnya **digabung** ke pesanan pelanggan yang sudah ada (lihat 4.4), muncul alert melayang di atas FAB: naik dari bawah, tampil 4 detik, lalu naik + memudar. Karena posisinya `fixed`, ringkasan keuangan & daftar pesanan di bawahnya **tidak ikut bergeser**.
- URL search param `?addOrder=true` → otomatis buka sheet Tambah Pesanan saat navigasi dari tab Tambah di bottom nav.

#### 4.3.1 Mode Ringkasan Barang (Checklist Live Shopping)

- Tampilkan daftar semua **jenis barang** lintas pesanan di event ini, dikelompokkan per nama barang.
- Tiap barang: nama, total qty diorder, jumlah pelanggan yang mesan, dan daftar siapa + berapa qty masing-masing.
- **Checkbox "obtained"** per pelanggan per barang — menandai barang sudah didapat/dibeli di toko saat live shopping.
- Update `obtained` langsung ke server (optimistic update).

### 4.4 Tambah / Edit Pesanan (Bottom Sheet)

- Context: event terkait (chip, non-editable).
- **Nama pelanggan** — autocomplete dari daftar Customer yang tersimpan (nama + no. HP). Bisa diisi bebas jika belum terdaftar. Saran otomatis ini fitur PRO `customer_suggestions`: di paket FREE nama pelanggan tetap bisa diketik manual dan di tempat saran muncul keterangan bahwa saran pelanggan tersedia di paket PRO (server tidak mengirim datanya sama sekali — lihat 5).
- **No. HP pelanggan** — opsional, dipakai untuk kirim WA dari halaman Invoice.
- Barang titipan — repeatable block: nama barang, harga asli, jumlah (qty), fee jastip.
  - **Fee auto-terisi** berdasarkan Aturan Fee event ini + harga barang yang diinput (lihat 4.9). Bila harga di luar semua tier, field fee dikosongkan untuk diisi manual.
  - **Fee berlaku per unit**: total satu barang = `(harga asli + fee) × qty`. Contoh: barang 30.000 + fee 4.000, qty 2 → (30.000 + 4.000) × 2 = 68.000.
  - **Saran nama barang & harga asli** — saat mengisi nama barang, muncul saran dari barang yang pernah dicatat di event ini (nama + daftar harga), diambil dari server (`getOrderSuggestions`). Ini fitur PRO `order_suggestions`: kalau terkunci, field tetap bisa diisi manual dan di tempat saran muncul keterangan "Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO" — server tidak mengirim data saran sama sekali ke user FREE (lihat 5).
- **Ringkasan otomatis**: total harga jual (`SUM((harga asli + fee) × qty)`), total fee, total tagihan.
- **Gabung otomatis (satu pelanggan = satu tagihan per event)**: kalau pelanggan yang sama sudah punya pesanan yang **belum lunas / DP** di event ini, barang yang baru langsung **digabung ke pesanan itu** (tidak bikin pesanan/tagihan kedua). Baris dengan nama, harga asli, dan fee yang sama persis cukup jadi satu baris dengan qty-nya dijumlahkan; nominal terbayar lama dibawa dan status pembayaran dihitung ulang dari total baru. Pesanan yang sudah **Lunas/Dikirim** tidak digabung (barang baru belum tentu ikut lunas), begitu juga kalau status barunya **Dikirim** — dua-duanya bikin pesanan baru. Aturan lengkapnya di `order-merge.ts`.
  - Setelah tersimpan, kalau barangnya tergabung, halaman Detail Event menampilkan **alert melayang** (komponen `ui/Toast.tsx`) berisi mis. "Barang baru digabung ke pesanan Budi 6608 yang masih belum lunas. Total tagihannya sekarang Rp…". Alert-nya `position: fixed` di atas FAB supaya **tidak mendorong komponen lain**, muncul naik dari bawah, lalu naik + memudar sendiri setelah 4 detik (bisa ditutup manual).
- **Status pembayaran**: Belum Lunas / DP / Lunas / Dikirim.
  - Jika status **DP**: muncul field input **Nominal DP** yang dibayarkan (`paidAmount`).
  - Jika status **Lunas/Dikirim**: `paidAmount` otomatis diisi = total tagihan.
- Simpan pesanan.

### 4.5 Invoice (Internal) — `/invoice/:eventId/:orderId`

- Halaman untuk jastiper — dilindungi auth.
- Termasuk fitur PRO `billing`. Datanya diambil lewat server function yang dijaga (`getOrderInvoice`), jadi user FREE ditolak walau URL-nya diketik langsung (lihat 5).
- Card invoice: nama brand/jastiper, no. invoice (8 karakter UUID), nama pelanggan, nama event, tanggal invoice, daftar item (qty × harga + fee), total tagihan.
- **Alamat kirim pelanggan**: diambil dari data Customer yang namanya cocok dengan nama pelanggan pesanan ini (aturan pencocokannya di `customer-matching.ts`, lihat 4.10). Kalau alamatnya belum diisi, muncul pengingat singkat untuk melengkapinya lewat Profil → Customer — biar jastiper tahu kenapa alamatnya tidak muncul di link tagihan.
- Info metode pembayaran aktif milik jastiper (bank, e-wallet, QRIS).
- Status pembayaran dengan badge warna.
- **Kirim ke WhatsApp**: input No. HP pelanggan (validasi format nomor Indonesia), tombol generate link `wa.me` dengan pesan dari **Template Chat WA** (lihat 4.8.5). Tombol ini cuma ada di halaman invoice, jadi otomatis ikut terkunci untuk paket FREE.
  - Jika pelanggan belum terdaftar di daftar Customer → muncul prompt untuk menambahkan.
- Tombol **Cetak** (`window.print()`).

### 4.6 Tagihan (Publik) — `/tagihan/:eventId/:orderId`

- Halaman publik tanpa auth — bisa dibagikan ke pelanggan lewat link.
- Termasuk fitur PRO `billing`, **dengan pengecualian (grandfathering)**: pesanan yang dibuat saat pemiliknya masih punya akses penuh (trial/PRO) tetap bisa dibuka walau sekarang paketnya FREE — link-nya sudah terlanjur dikirim ke pelanggan, jadi tidak boleh mati mendadak. Dicek lewat `hasFullAccessAtForUser(order.createdAt)` (lihat 5).
- Tampilan mirip Invoice internal tapi tanpa fitur kirim WA dan tanpa info internal.
- **Alamat kirim pelanggan** ikut ditampilkan (baris "Alamat kirim: ..." di blok pelanggan) supaya pelanggan yang membuka link bisa memastikan alamat pengirimannya sendiri sudah benar. Ini satu-satunya info pelanggan yang dikirim ke link publik selain nama pelanggan — no. HP pelanggan tetap tidak ikut, dan yang tampil cuma alamat milik pelanggan pesanan itu sendiri.
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
- (Master Control & Activity Logs belum ada UI-nya walau tabelnya sudah siap di DB — lihat 9.)

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
- Data: nama, nomor HP (opsional), alamat (opsional).
- Alamat ikut tersimpan di form Tambah/Edit Customer dan ditampilkan di kartu customer; pencarian di halaman ini mencakup nama, no. HP, dan alamat.
- Alamatnya dipakai sebagai **alamat kirim** pelanggan di halaman Invoice internal (4.5) dan link Tagihan publik (4.6). Karena order cuma menyimpan nama pelanggan (tidak ada relasi ke tabel `customers`), pencocokannya dilakukan lewat nama pelanggan pesanan dengan aturan di `customer-matching.ts` — sama seperti cara no. HP pelanggan dicari di halaman Invoice.
- Autocomplete nama customer dipakai di form Tambah Pesanan.
- Tambah customer bisa dilakukan dari halaman Customer atau dari halaman Invoice saat nomor HP belum terdaftar.

### 4.11 Pesanan (Tab Global) — `/pesanan`

- **MVP: halaman dengan tulisan "Coming soon"** dan deskripsi singkat rencana ke depan.
- FAB tengah di bottom nav (tab "Tambah") mengarah ke `/pesanan/new` → redirect ke beranda dengan `?addOrder=true` (flow tambah pesanan cepat tanpa pilih event spesifik — belum diimplementasi penuh).
- Halaman pemilih event (`/pesanan/new`) cuma menampilkan **event aktif** — event yang nonaktif tidak bisa ditambah pesanan baru (server juga menolak `createOrder`).

### 4.12 Paket & Langganan — `/profil/langganan`

- Halaman status langganan, dibuka dari baris **Langganan** di Profil. Punya header sendiri dengan tombol back (bottom nav tetap tampil di sini).
- **Kartu paket**: ikon Crown + teks "Paket Trial / FREE / PRO" + kalimat periode — "Sisa 12 hari (sampai 12 Februari 2026)" untuk trial, "Aktif sampai …" untuk PRO, "Masa trial berakhir …" untuk FREE — dilengkapi keterangan singkat masing-masing plan.
- **Daftar fitur PRO** (dirakit dari `PRO_FEATURES` — sekarang 5 fitur) dengan status **Terbuka / Terkunci** per fitur (ikon centang vs gembok) + deskripsi singkat tiap fitur.
- **Pengajuan upgrade** (muncul kalau belum PRO): kartu menampilkan nominal harga membership + gambar QRIS dari pengaturan admin → member scan & bayar → upload bukti transfer lewat `SubmitSubscriptionModal` (PNG/JPEG/WEBP, maks 1.5MB, dikirim sebagai data URL base64).
- Selama pengajuan belum diproses, halaman menampilkan kartu **"Menunggu verifikasi"** (nominal, tanggal pengajuan, tautan bukti transfer) dan form pengajuan tidak bisa dibuka lagi — server menolak pengajuan kedua karena maksimal **satu baris `pending` per user**.
- **Riwayat langganan**: baris yang sudah diproses (`active` / `rejected`) ditampilkan lengkap dengan periode, nominal, dan catatan review admin.
- Yang ditagih adalah **snapshot harga saat pengajuan dikirim** (`subscriptions.amount`) — kalau admin mengubah harga setelahnya, pengajuan yang sudah masuk tetap memakai harga lama (lihat 5.7).
- Halaman ini **hanya menampilkan** hasil entitlement dari server (`fetchCurrentUser` + `fetchMySubscriptionState`) — tidak ada perhitungan plan di client.

### 4.13 Dashboard Admin — `/admin`

Halaman terpisah untuk **admin**, di luar `app-shell` member (`src/routes/admin.tsx`
punya layout sendiri: tanpa bottom nav member, header sendiri + tombol **Keluar**).
User biasa yang membuka `/admin` di-redirect ke `/`; sebaliknya user admin yang
membuka halaman member (`_app`) langsung dipindahkan ke `/admin`, dan login / callback
Google admin juga mendarat di `/admin`.

Proteksi berlapis: `beforeLoad` di route cuma UX (redirect), sedangkan pagar yang
mengikat ada di server — **setiap** server function admin memanggil
`requireAdminUser()` (`src/lib/admin.ts`) di baris pertama handler-nya dan melempar
`AdminRequiredError` (`code = 'ADMIN_REQUIRED'`) kalau bukan admin.

**Pengaturan pembayaran PRO** (kartu teratas):

- **QRIS Pembayaran** — upload / ganti gambar QRIS yang dipakai member saat mengajukan upgrade (`UpdateQrisModal`), maks 1.5MB (PNG/JPEG/WEBP). Kalau belum ada QRIS, kartunya memberi tahu bahwa member belum bisa mengajukan upgrade.
- **Harga Membership** — nominal yang wajib ditransfer member, bisa diubah inline. Perubahan harga **hanya berlaku untuk pengajuan baru** (lihat 5.7).

**Kartu metrik** (`getAdminMetrics`) — selalu **2 kartu per baris**, bukan menumpuk
satu-satu. Grid-nya sengaja memakai `grid grid-cols-2` polos, **bukan**
`sm:grid-cols-2`: `sm:` itu breakpoint **viewport**, bukan lebar container. Karena
shell-nya sudah dibatasi 480px (lihat di bawah), viewport ponsel — tempat aplikasi ini
paling sering dipakai — selalu di bawah 640px, sehingga `sm:grid-cols-2` tidak pernah
aktif dan kartunya jatuh menumpuk satu per baris walau sebenarnya 480px cukup untuk
dua kartu. Dengan `grid-cols-2` polos, dua kartu per baris berlaku di semua ukuran.

Layout admin memakai kelas `app-shell` + `max-w-2xl`, tapi `max-w-2xl` tidak menang:
`.app-shell { max-width: 480px }` di `src/styles.css` ditulis **tanpa `@layer`**,
sedangkan utility Tailwind ada di `@layer utilities` — aturan tanpa layer selalu
menang, jadi lebar efektif halaman admin tetap 480px (sama seperti shell member).

| Kartu        | Isi                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Users  | Jumlah seluruh user terdaftar                                                                                                                                     |
| Active Users | User yang punya sesi login baru dalam **14 hari** terakhir (`count(distinct user_id)` dari `sessions`), bukan dari `activity_logs` yang belum diisi kode mana pun |
| PRO Active   | Baris `subscriptions` berstatus `active` **dan** `ends_at`-nya belum lewat                                                                                        |
| PRO Pending  | Pengajuan berstatus `pending`                                                                                                                                     |
| PRO Revenue  | `SUM(amount)` dari semua pengajuan yang **pernah disetujui** (`active` + `expired`), diformat Rupiah                                                              |

**Verifikasi langganan PRO**:

- Daftar pengajuan **lintas semua user**, terbaru dulu, difilter dengan tab **Pending / PRO Aktif / Semua** (filter di client). Kalau ada pengajuan menggantung sementara tab aktif bukan Pending, muncul tombol pintasan "Tinjau N pengajuan pending".
- Tiap kartu pengajuan menampilkan identitas user (nama + brand + email), nominal, tanggal bayar, tautan bukti transfer, badge status, dan tombol **Setujui / Tolak**.
- **Setujui** (`approveSubscription`): baris `pending` jadi `active` dengan jendela masa aktif dihitung `nextProWindow()` — perpanjangan menyambung dari `ends_at` yang masih berlaku, bukan dari hari ini — plus `reviewed_by`, `reviewed_at`, dan catatan review.
- **Tolak** (`rejectSubscription`): status jadi `rejected` + catatan review.
- Pengajuan yang sudah pernah diproses tidak bisa diproses ulang (server menolak dengan "Pengajuan ini sudah diproses sebelumnya"). Catatan review diisi lewat `ReviewSubscriptionModal` (mode approve / reject).

## 5. Paket & Entitlement (Trial / FREE / PRO)

Tiga status akses. Seluruh aturannya ditulis di `src/lib/subscription.ts` (modul murni tanpa `db`, jadi dipakai bersama server & client) dan dihitung ulang setiap kali dibutuhkan.

| Plan  | Cara dapat                                                                    | Akses fitur                            |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Trial | Otomatis, 30 hari sejak user dibuat (`TRIAL_DAYS`)                            | Semua fitur terbuka                    |
| FREE  | Otomatis setelah trial habis (atau setelah masa PRO habis)                    | Fitur dasar saja, 5 fitur PRO terkunci |
| PRO   | Langganan 30 hari (`PRO_DURATION_DAYS`) yang pembayarannya diverifikasi admin | Semua fitur terbuka                    |

### 5.1 Cara status dihitung

- **Tidak ada kolom `users.is_pro`.** Status dihitung dari dua sumber: (1) kolom `users.trial_started_at` + `users.trial_ends_at` untuk masa trial, (2) histori tabel `subscriptions` — baris `status = 'active'` yang `ends_at`-nya belum lewat berarti PRO.
- Prioritas: **PRO aktif > trial belum habis > FREE** (fungsi `resolveEntitlement`).
- Nilai trial diisi **DEFAULT kolom di database**, bukan diset di kode, supaya semua jalur pembuatan user (register email, Google OAuth, seed) otomatis kebagian trial yang sama.
- Aturan buka/tutup fitur ditulis **satu kali** di `featuresForPlan(plan)`: `plan !== 'free'` → semua fitur PRO terbuka. Fungsi inilah yang dibaca server & client, jadi tidak ada lagi pengecekan `isPro` yang tersebar sendiri-sendiri.
- Entitlement yang dikirim ke client (lewat `fetchCurrentUser`) berisi: `plan`, `isTrial`, `isPro`, `proUntil`, `trialStartedAt`, `trialEndsAt`, `trialDaysLeft`, dan `features` (satu flag per fitur PRO).

### 5.2 Daftar fitur PRO (kunci + gerbang server)

| Kunci fitur            | Fitur                                                              | Gerbang server                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `billing`              | Tagih: halaman invoice internal, kirim WA, dan link tagihan publik | `requireFeature(getUserEntitlements(user), 'billing')` di `getOrderInvoice`; di `getPublicOrderInvoice` ada aturan grandfathering (5.5) |
| `payment_methods`      | Tambah / edit / hapus / aktif-nonaktif metode pembayaran           | `requireUserFeature('payment_methods')` di 4 server function tulis — baca daftar tetap terbuka                                          |
| `order_suggestions`    | Saran nama barang & harga asli di form Tambah/Edit Pesanan         | `getOrderSuggestions` mengembalikan `unlocked: false` + data kosong (tidak melempar error)                                              |
| `fee_suggestions`      | Saran tier aturan fee di form Tambah/Edit Aturan Fee               | `getFeeSuggestions` mengembalikan `unlocked: false` + data kosong                                                                       |
| `customer_suggestions` | Saran nama & no. HP pelanggan di form Tambah/Edit Pesanan          | `getCustomerSuggestions` mengembalikan `unlocked: false` + data kosong (tidak melempar error)                                           |

Label & deskripsi tiap kunci (`PRO_FEATURE_INFO`), label/deskripsi plan (`PLAN_INFO`, `planLabel()`), dan pesan seragam `featureLockedMessage()` juga tinggal di `src/lib/subscription.ts` — jadi teks UI dan pesan server tidak bisa beda.

### 5.3 Gerbang server (yang mengikat)

- Pintu masuknya `src/lib/entitlements.ts`: `getUserEntitlements(user)` (hitung status) → `requireFeature()` / `requireUserFeature()` yang melempar `FeatureLockedError` (`code = 'FEATURE_LOCKED'`, pesannya siap ditampilkan) kalau fiturnya terkunci.
- Server function **tidak boleh** menulis `plan === 'pro'` sendiri; selalu lewat helper di atas.
- Endpoint saran (`order_suggestions`, `fee_suggestions`, `customer_suggestions`) sengaja **tidak melempar error**, tapi mengembalikan `unlocked: false` + data kosong supaya halaman tetap bisa dirender dan UI-nya cukup menampilkan status terkunci. Yang penting: server tidak pernah mengirim data saran ke user FREE.
- Karena pengecekannya di server, UI yang diakali (memanggil endpoint langsung) tetap ditolak.

### 5.4 Perilaku UI saat fitur terkunci

- `ProBadge` — penanda kecil "PRO" pada kontrol yang terkunci.
- `ProLockPrompt` — dialog seragam untuk fitur terkunci: penjelasan fiturnya, isi paket PRO, status plan user saat ini, lalu tombol **"Upgrade ke PRO"** (menuju `/profil/langganan`) dan "Nanti saja".
- Kontrol yang tampil terkunci di paket FREE: tombol **Tagih** di Detail Event (gembok + badge PRO; klik = dialog upgrade), tombol "Tambah metode pembayaran" serta toggle aktif-nonaktif metode (semua aksi tulis dialihkan ke dialog upgrade), lalu keterangan pengganti saran di form pesanan ("Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO"), di form aturan fee ("Saran tier otomatis dari riwayat harga & fee barang tersedia di paket PRO"), dan untuk saran pelanggan ("Saran nama & no. HP pelanggan dari data customer tersedia di paket PRO").
- Baris **Langganan** di Profil menampilkan status paket + chip **Upgrade** (khusus FREE) sebagai jalan masuk ke halaman Paket & Langganan.
- Semua kunci di UI dibaca dari `canUseFeature(entitlements, '<kunci fitur>')` — komponen tidak menghitung status plan sendiri.

### 5.5 Grandfathering (agar tidak merusak data yang sudah beredar)

- Link tagihan publik (`/tagihan/:eventId/:orderId`) untuk pesanan yang dibuat saat pemiliknya masih punya akses penuh **tetap bisa dibuka** walau sekarang paketnya FREE — dicek dengan `hasFullAccessAtForUser(owner, order.createdAt)`. Alasannya link itu sudah terlanjur dikirim ke pelanggan lewat WhatsApp.
- Ringkasnya: **akses sekarang** menentukan boleh-tidaknya membuat/membuka invoice baru; **akses saat pesanan dibuat** dipakai untuk menoleransi link lama.

### 5.6 Aktivasi PRO (alur yang berjalan sekarang)

- Pembayaran **manual** (QRIS yang diupload admin), verifikasi oleh **admin** di `/admin` (lihat 4.13).
- Tabel `subscriptions` menyimpan semuanya: durasi (`duration_days`), periode PRO (`started_at` / `ends_at`), info pembayaran (nominal, metode, provider, nama pengirim, referensi transfer, bukti transfer, tanggal bayar, catatan), plus kolom hasil review admin (`reviewed_by`, `reviewed_at`, `review_note`).
- Maksimal **satu baris `pending` per user** (unique index `subscriptions_pending_per_user_unique`), jadi bukti transfer tidak bisa dikirim dobel sebelum yang lama diproses.
- Alurnya lengkap dua sisi: member mengajukan lewat `/profil/langganan` (`submitSubscriptionRequest` — upload bukti transfer, nominal di-snapshot dari harga admin), admin memverifikasi lewat `approveSubscription` / `rejectSubscription`.
- Helper yang dipakai kedua sisi: `nextProWindow()` (perpanjangan menambah dari `ends_at` yang masih aktif, bukan dari hari ini), `listSubscriptions()`, `listActiveSubscriptions()`, `findPendingSubscription()`, `getSubscriptionState()`.
- Yang **belum** ada: penetapan/pencabutan PRO manual tanpa pengajuan, pengiriman email/notifikasi saat status berubah, dan job yang menandai baris `expired` (masa habis saat ini cukup dideteksi dari `ends_at` di `resolveEntitlement()`) — lihat 9.

### 5.7 Pengaturan pembayaran PRO (admin)

- Harga membership PRO **bukan konstanta di kode**: disimpan di tabel singleton `subscription_settings` (`pro_price`) dan diubah admin dari `/admin`. Durasi PRO tetap konstanta `PRO_DURATION_DAYS` (30 hari).
- Gambar QRIS pembayaran ada di tabel yang sama (`qris_image`, data URL base64, maks 1.5MB) — dibaca member lewat `fetchSubscriptionPaymentInfo()` dan ditulis admin lewat `updateSubscriptionQris()`. Barisnya cuma satu: `getSubscriptionSettings()` ambil baris pertama dan update-nya selalu upsert.
- `subscriptions.amount` di-snapshot dari harga tersebut **saat pengajuan dibuat**, jadi mengubah harga tidak mengubah nominal pengajuan yang sudah masuk (dan sebaliknya, nominal lama tidak berubah walau harga dinaikkan).

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

Halaman admin tidak ikut skema tab di atas: `/admin` (dan sub-halamannya) memakai
layout sendiri di luar `app-shell` member — tanpa bottom nav, header sendiri dengan
identitas "Admin Jastip" + tombol Keluar. User dengan `is_admin = true` yang membuka
halaman member otomatis dipindahkan ke `/admin`, dan login / callback Google admin
mendarat di `/admin` (lihat 4.13).

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
  is_admin          boolean NOT NULL default false  -- akses /admin, diaktifkan manual lewat DB
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

-- SUBSCRIPTION SETTINGS (baris tunggal pengaturan pembayaran PRO, diatur admin)
subscription_settings
  id                uuid primary key
  qris_image        text (nullable)     -- gambar QRIS pembayaran PRO (data URL base64)
  pro_price         decimal(12,2) NOT NULL default 0  -- harga membership PRO yang berlaku
  updated_at        timestamp
  updated_by        uuid → users.id (set null on delete) (nullable)
  -- singleton: cukup satu baris, dibaca getSubscriptionSettings() (ambil baris pertama)
  -- pro_price di-snapshot ke subscriptions.amount tiap ada pengajuan baru

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
  address           text (nullable)  -- alamat customer, opsional
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
  is_active         boolean NOT NULL default true  -- nonaktif = event ditutup (bukan hapus)
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
- **`is_active` di `events`**: nonaktif ≠ hapus. Event nonaktif disembunyikan dari daftar "Event aktif" di beranda dan ditolak saat `createOrder`, tapi barisnya, pesanannya, dan tagihannya tetap ada; diatur dari menu tiga titik di halaman Detail Event. Ringkasan uang (beranda & Keuangan) tetap menghitung event nonaktif karena uangnya nyata.
- **`password_hash` nullable**: user yang hanya mendaftar via Google tidak punya password; tampilan Profil menyesuaikan.
- **`wa_message_template` di `users`**: template default ada di `src/lib/message-template.ts`. Jika null, dipakai template default.
- **Status langganan tidak disimpan sebagai flag**: tidak ada kolom `users.is_pro`. Masa trial ada di `users.trial_started_at` / `users.trial_ends_at`, sedangkan status PRO dihitung dari baris `subscriptions` berstatus `active` yang `ends_at`-nya belum lewat (lihat 5.1).
- **`subscriptions` bersifat histori, bukan state**: satu baris = satu pengajuan/pembelian, riwayat pembayaran selalu bisa diaudit. Verifikasi admin mengubah baris `pending` itu sendiri jadi `active` dan **menggeser jendelanya** (`started_at` / `ends_at` dihitung `nextProWindow()`: perpanjangan menyambung dari `ends_at` yang masih berlaku), jadi tidak ada baris tambahan saat perpanjangan. Status `expired` sudah ada di enum tapi belum pernah ditulis otomatis oleh kode mana pun — masa habis cukup dideteksi dari `ends_at` saat menghitung entitlement.
- **Kolom `payment_*` di `subscriptions`**: info pembayaran disimpan di tabel yang sama supaya admin bisa mencocokkan transfer tanpa tabel tambahan. Bukti transfer memakai pola yang sama dengan `payment_methods.qris_image` (data URL base64, maks 1.5MB).
- **`is_admin` ditandai di DB, bukan di UI**: kolom `users.is_admin` (default `false`) cuma diaktifkan manual lewat `pnpm db:studio` oleh pemilik aplikasi — sengaja tidak ada jalur self-service dari aplikasi supaya tidak ada yang bisa mengangkat dirinya jadi admin. Nilainya dipakai `requireAdminUser()` (`src/lib/admin.ts`) di server dan `fetchCurrentUser()` di client.
- **`subscription_settings` = baris tunggal**: harga membership PRO dan gambar QRIS pembayaran sengaja tidak jadi konstanta di kode supaya admin bisa mengubahnya tanpa deploy. Harga di-snapshot ke `subscriptions.amount` saat pengajuan dibuat (lihat 5.7).
- **Default trial ada di level database**: `trial_started_at DEFAULT now()` dan `trial_ends_at DEFAULT now() + interval '30 days'` — semua jalur pembuatan user otomatis kebagian trial. Migrasi `0001_curious_blade.sql` membackfill user lama dengan aturan "trial mulai saat user dibuat" (`trial_started_at = created_at`), dan `pnpm db:backfill-trial` dipakai kalau pemilik aplikasi mau mengecualikan user lama (mis. trial 30 hari mulai hari rilis).
- **Perubahan skema wajib lewat migrasi Drizzle** (`pnpm db:generate` + `pnpm db:migrate`, file di `drizzle/` ikut di-commit) — jangan pakai `pnpm db:push` supaya setiap perubahan DB ke-track di git. Langkahnya di 7.1.

### 7.1 Perubahan skema database — wajib lewat migrasi (jangan `db:push`)

Setiap perubahan skema (tabel, kolom, enum, index, constraint) **wajib lewat file migrasi Drizzle yang ikut di-commit ke git**, bukan `pnpm db:push`. `db:push` menyamakan database dengan `src/db/schema.ts` secara langsung tanpa meninggalkan jejak apa pun: perubahan tidak ke-track di git, tidak bisa di-review, tidak punya riwayat untuk rollback, dan skema DB lokal / anggota tim / produksi bisa berbeda diam-diam.

**Alur yang benar:**

1. Edit dulu `src/db/schema.ts` — ini satu-satunya sumber kebenaran skema.
2. `pnpm db:generate` → drizzle-kit membuat file SQL baru di `drizzle/` + snapshot di `drizzle/meta/`. Semua file itu **wajib di-commit** satu paket dengan perubahan `schema.ts`-nya.
3. **Baca dan periksa file SQL hasil generate** sebelum dijalankan — khususnya kalau ada kolom yang di-rename atau tipe data yang diubah, karena drizzle-kit bisa menghasilkan `DROP COLUMN` + `ADD COLUMN` yang membuang data lama. Kalau perlu, sunting manual jadi `ALTER TABLE ... RENAME COLUMN` / `ADD COLUMN ... DEFAULT` lalu simpan begitu.
4. `pnpm db:migrate` untuk menerapkan migrasi ke database (lokal maupun produksi).
5. Migrasi yang **sudah** di-commit tidak boleh diubah lagi — hash isinya dipakai Drizzle untuk menandai sudah/belum dijalankan. Kalau ada yang salah, buat migrasi perbaikan baru.
6. `pnpm db:push` hanya untuk eksperimen sekali pakai di DB scratch yang datanya boleh hilang. **Jangan** dipakai di database yang berisi data user atau dipakai bersama.

**Catatan operasional:**

- Aplikasi **tidak** menjalankan migrasi otomatis saat start (`src/db/index.ts` cuma membuat koneksi), jadi `pnpm db:migrate` harus dijalankan manual setelah deploy.
- Nama file bawaan drizzle-kit berupa kode acak (`0000_greedy_thing.sql`); `0002_add_users_is_admin.sql`, `0003_add_customers_address.sql`, dan `0004_add_events_is_active.sql` di-rename manual supaya mudah dibaca. Rename file `*.sql` boleh, asal `tag` pada `drizzle/meta/_journal.json` ikut disesuaikan.
- **Migrasi `0003` menyusul celah lama**: tabel `subscription_settings` (dari commit "feat(admin): implement admin dashboard and subscription management") sebelumnya dibuat langsung di database lewat `db:push` sehingga tidak punya file migrasi — makanya tabel itu ikut ter-generate di `0003`. Statement-nya sengaja dibuat idempotent (`CREATE TABLE IF NOT EXISTS` + cek `pg_constraint`) supaya jalur database yang tabelnya sudah ada (lokal & produksi, sudah berisi data) dan database yang dibangun dari nol dua-duanya aman. Kalau ada DB yang perubahan skemanya sudah ada tapi belum tercatat di `drizzle.__drizzle_migrations`, tandai dulu dengan `pnpm db:baseline --tag=<tag>` (mis. `--tag=0002_add_users_is_admin`) sebelum `pnpm db:migrate`.
- Untuk database yang skemanya **sudah ada duluan** (dibuat lewat `db:push` sebelum folder `drizzle/` dipakai), jalankan `pnpm db:baseline` (atau `pnpm db:baseline --tag=0000_greedy_thing`) sekali supaya migrasi lama tidak dijalankan ulang dan tabel/data yang sudah ada tidak tersentuh — lihat `scripts/drizzle-baseline.ts`.
- `pnpm db:studio` tetap boleh dipakai untuk mengubah **data** (mis. menandai `users.is_admin = true`), tapi bukan untuk mengubah skema.

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
- Event yang **nonaktif tetap ikut dihitung** di semua angka di atas: nonaktif cuma menyembunyikan event dari daftar event aktif, bukan mengeluarkan catatan uangnya.

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
│   ├── ReviewSubscriptionModal.tsx  # Modal setujui/tolak pengajuan (admin)
│   ├── SubmitSubscriptionModal.tsx  # Modal upload bukti transfer (member)
│   ├── ThemeToggle.tsx
│   ├── UpdateQrisModal.tsx     # Upload / ganti QRIS pembayaran PRO (admin)
│   └── ui/                    # Komponen primitif (Switch, ConfirmModal, NumberInput, Toast)
├── db/
│   ├── index.ts               # Koneksi Drizzle + pg
│   └── schema.ts              # Definisi semua tabel & relasi (termasuk subscriptions & subscription_settings)
├── lib/                  # Server functions (createServerFn) + modul murni
│   ├── admin.ts               # requireAdminUser + AdminRequiredError (pagar admin)
│   ├── admin-functions.ts     # Metrik, daftar pengajuan, approve/reject, QRIS & harga PRO
│   ├── admin-queries.ts       # Query metrik admin + pengajuan lintas user (server)
│   ├── auth.ts                # getSessionUser, session management
│   ├── auth-functions.ts      # login, register, logout, updateProfile, changePassword
│   ├── client-bundle-safety.test.ts  # Guard: `db`/`pg` tidak boleh bocor ke bundle client
│   ├── customer-matching.ts   # Cocokkan order → customer lewat nama (murni, tanpa db)
│   ├── customer-matching.test.ts  # Unit test pencocokan order → customer
│   ├── customer-suggestions-functions.ts  # getCustomerSuggestions (gerbang customer_suggestions)
│   ├── customers-functions.ts # Endpoint CRUD customer
│   ├── customers-queries.ts   # Query customer aktif (server-only)
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
│   ├── order-merge.ts         # Aturan gabung pesanan pelanggan yang sama (murni, tanpa db)
│   ├── order-merge.test.ts    # Unit test penggabungan pesanan
│   ├── order-suggestions-functions.ts  # getOrderSuggestions (gerbang order_suggestions)
│   ├── order-totals.ts        # lineTotal, summarizeItems
│   ├── orders-functions.ts    # CRUD order & item, invoice, updateItemsObtained (+ gate billing)
│   ├── password-reset-functions.ts
│   ├── password-reset-mail.ts
│   ├── payment-methods-functions.ts  # CRUD metode pembayaran (+ gate payment_methods)
│   ├── subscription.ts        # Aturan trial/FREE/PRO, PRO_FEATURES, PLAN_INFO (murni)
│   ├── subscription.test.ts   # Unit test aturan plan & entitlement
│   ├── subscription-functions.ts  # Pengajuan upgrade + status langganan milik member
│   ├── subscription-queries.ts # Baca histori & pengajuan subscription (server)
│   └── subscription-settings-queries.ts  # Harga & QRIS PRO — baris tunggal (server)
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
│   ├── admin.tsx              # Layout admin (guard is_admin + header Keluar, tanpa BottomNav)
│   ├── admin/
│   │   └── index.tsx          # Dashboard admin (metrik, pengaturan PRO, verifikasi pengajuan)
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

**Konvensi penamaan & batas server/client** (ini yang bikin app-nya tidak rusak saat build):

- Server function (`createServerFn`) tinggal di file `*-functions.ts`. File ini di-import langsung oleh halaman/komponen client, jadi **query `db` tidak boleh ditulis di level modul** — TanStack Start cuma membuang import yang dipakai di dalam handler, sehingga import `src/db` ikut ke bundle browser (`drizzle-orm/node-postgres` → `pg` → `events`) dan app-nya mati dengan error `Cannot access events.EventEmitter in client code`.
- Query yang butuh `db` ditaruh di file `*-queries.ts` (server-only, tidak pernah di-import client): `admin-queries.ts`, `customers-queries.ts`, `subscription-queries.ts`, `subscription-settings-queries.ts`. Urutannya: halaman → `*-functions.ts` (pagar auth/entitlement + validasi zod) → `*-queries.ts` (query murni).
- Aturan di atas dijaga otomatis oleh `src/lib/client-bundle-safety.test.ts`: satu test menolak `export function` biasa di file `*-functions.ts`, satu test lagi menolak halaman/komponen yang meng-import `src/db`. Jalankan `npm test` setelah menambah server function baru.
- Aturan langganan/trial/PRO yang murni (tanpa `db`) tinggal di `subscription.ts`, pagar admin di `admin.ts`, pagar PRO di `entitlements.ts` — supaya tidak ada pengecekan plan/admin yang ditulis ulang di tempat lain.

## 9. Di Luar Cakupan MVP (Next Phase)

- Tab Pesanan (list & filter lintas event).
- **Penyempurnaan alur PRO**: job yang menandai baris `subscriptions` jadi `expired` saat `ends_at` lewat, pengingat perpanjangan, serta tindakan admin lanjutan (beri/cabut PRO manual tanpa pengajuan, ubah durasi per user). Pengajuan dari dalam aplikasi + panel verifikasinya sendiri **sudah ada** (lihat 4.12, 4.13, 5.6).
- Reminder otomatis ke pelanggan yang belum lunas (WhatsApp API / bot).
- Payment gateway (pembayaran online) — untuk MVP masih manual/transfer.
- Verifikasi email saat register.
- Aplikasi mobile native — MVP web/PWA saja.
- Import Excel / Ekspor Data.
- Master Control & Activity Logs (tabel `activity_logs` sudah ada di DB, tapi belum ada UI maupun kode yang menulis ke sana — karena itu metrik "Active Users" di dashboard admin sementara dihitung dari baris `sessions`).
- Notifikasi push (service worker sudah ada via Workbox, tapi belum diimplementasi).
