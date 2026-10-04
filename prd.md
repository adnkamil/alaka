# PRD — ALAKA (PWA)

## 1. Ringkasan Produk

**ALAKA** adalah aplikasi manajemen jastip (titip beli) berbasis web, mobile-first,
dan bisa diinstall sebagai PWA. Ditujukan untuk jastiper yang saat ini mengelola
pesanan secara manual (spreadsheet/chat), agar bisa mengelola event belanja,
pesanan pelanggan, dan keuangan dalam satu tempat.

Aplikasi bersifat **multi-tenant** — siapa saja bisa mendaftar dan setiap
user memiliki data (event, pesanan, aturan fee) yang terisolasi dari user
lain. Semua user memiliki role yang sama sebagai jastiper (tidak ada role
customer terpisah), dengan satu pengecualian: **admin** — ditandai kolom
`users.is_admin` (default `false`, diaktifkan manual lewat DB) — yang punya
dashboard sendiri di `/admin` untuk memverifikasi pengajuan langganan, daftar
customer di `/admin/customers`, serta halaman pengaturan di `/admin/pengaturan`
untuk harga & QRIS pembayaran PRO (lihat 4.13–4.15).

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
| Baca file Excel     | `read-excel-file` (build `/browser`, di-`import()` dinamis waktu import data — lihat 4.3.2)                                      |
| Tulis file Excel    | `xlsx` (SheetJS — `utils.aoa_to_sheet` + `writeFile`, di-`import()` dinamis: unduh template import 4.3.2 & export pesanan 4.3.3) |

## 4. Fitur & Halaman

### 4.1 Autentikasi

- **Register** — nama, nama brand jastip (opsional), email, password + konfirmasi. Self-service, langsung aktif tanpa verifikasi email (untuk MVP).
- **Login** — email + password, opsi "Ingat saya". Atau **login/register via Google** (Google OAuth 2.0, route `/api/auth/google` + `/api/auth/google/callback`).
- **Lupa Sandi** (`/lupa-sandi`) — user masukkan email, terima link reset via email (mailer).
- **Reset Sandi** (`/reset-sandi/:token`) — halaman ganti password via token sekali pakai (SHA-256 hash, ada `expires_at` + `used_at`).
- Route protection: layout `_app` melakukan `beforeLoad` cek session, redirect ke `/login` jika belum login. Bottom nav tab **tidak muncul** di halaman login/register.

### 4.2 Beranda

- **Header**: nama brand aplikasi **ALAKA**, dan di bawahnya sapaan **"Halo {nama brand user}"** — diambil dari `users.brand_name` (bukan nama pribadi user), dengan fallback nama user lalu `'Jastiper'` kalau brandnya belum diisi (pola fallback yang sama dipakai di halaman Profil).
- Ringkasan keuangan singkat (2 kartu: **Uang masuk** = total `paidAmount` seluruh event; **Belum bayar** = sisa tagihan semua pesanan yang belum lunas). Kedua angka ini menghitung **semua** event termasuk yang nonaktif — event ditutup bukan berarti uangnya hilang dari catatan.
- List **Event aktif** milik user (diurutkan terbaru dulu): card berisi nama, tanggal (format `d MMM`), jumlah pesanan.
- Event yang **nonaktif** (lihat 4.3) dikeluarkan dari daftar itu dan dipindah ke bagian **Event nonaktif (n)** yang terlipat di bawahnya (buka-tutup), tiap card diberi badge "Nonaktif" dan tampil lebih redup. Datanya tidak dihapus, cuma tidak mengganggu daftar event yang masih jalan.
- Tap card → masuk ke Detail Event.
- Link **Tambah event** di pojok kanan atas.
- Avatar pengguna di header → link ke halaman Profil.

### 4.3 Detail Event (`/events/:eventId`)

- **Header**: tombol back, nama event (+ badge **Nonaktif** kalau event sudah ditutup), menu tiga titik berisi: pilih **Aturan Fee** event (lihat 4.9), **Import data (Excel/CSV)** (lihat 4.3.2), **Export data (Excel)** (lihat 4.3.3), toggle **Event aktif**, dan **Hapus event** (dengan konfirmasi).
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
- URL search param buka/tutup sheet dipakai sebagai **sumber kebenaran** (bukan state lokal), supaya tombol **back** menutup sheet dan tetap di halaman event: `?addOrder=true` (Tambah Pesanan — juga dipakai navigasi dari tab Tambah di bottom nav), `?editOrder=<orderId>` (Edit Pesanan), `?duplicateOrder=<orderId>` (ulang pesanan; nama pelanggannya diambil dari data order). Kontrak param-nya ada di `lib/order-sheet-search.ts`. Tombol X/Simpan menutup sheet dengan mem-pop entry history yang tadi di-push (jadi back berikutnya tidak membuka sheet lagi); kalau sheet datang dari link/URL langsung, URL-nya cukup di-replace supaya user tetap di halaman event.

#### 4.3.1 Mode Ringkasan Barang (Checklist Live Shopping)

- Tampilkan daftar semua **jenis barang** lintas pesanan di event ini, dikelompokkan per nama barang.
- Tiap barang: nama, total qty diorder, jumlah pelanggan yang mesan, dan daftar siapa + berapa qty masing-masing.
- **Checkbox "obtained"** per pelanggan per barang — menandai barang sudah didapat/dibeli di toko saat live shopping.
- Update `obtained` langsung ke server (optimistic update).

#### 4.3.2 Import Data Pesanan dari Excel/CSV

Buat jastiper yang sudah punya catatan pesanan di Excel/CSV (mis. hasil rekap chat) — daripada diketik ulang satu-satu.

- **Masuknya cuma dari menu tiga titik (⋮)** di halaman Detail Event: item **"Import data (Excel/CSV)"**. Sengaja tidak ada tombol di badan halaman supaya alur normal (Tambah Pesanan) tetap yang paling menonjol. Item ini **nonaktif** waktu eventnya nonaktif (sama seperti FAB +, dan `importOrders` di server juga menolak) — kalau eventnya nonaktif, keterangannya berubah jadi ajakan mengaktifkan event dulu.
- **Format file**: `.xlsx` (Excel modern) atau `.csv` (pemisah `,` maupun `;`, deteksi otomatis dari baris pertama). File `.xls` lama belum didukung dan ditolak dengan pesan yang menjelaskan cara menyimpannya ulang.
- **Download template**: di layar awal modal (sebelum file dipilih) ada tombol **Download template** yang mengunduh contoh file **`.xlsx`** (`template-import-pesanan.xlsx`) siap isi. Isinya datang dari `buildImportTemplateRows()` di `lib/order-import.ts` (murni — cuma data, tanpa library Excel), lalu dibentuk jadi sheet pakai SheetJS `xlsx`: `XLSX.utils.aoa_to_sheet()` → `XLSX.utils.book_new()` → `XLSX.utils.book_append_sheet()` → `XLSX.writeFile()` (SheetJS yang menyiapkan file & memicu unduhannya di browser). Library `xlsx` di-`import()` **dinamis di dalam handler** (lihat 6.4) supaya tidak ikut bundle awal dan tidak pernah jalan saat SSR. Isinya **4 baris contoh untuk 2 pelanggan** (masing-masing 2 barang; pelanggan pertama sengaja muncul di dua baris supaya kelihatan bahwa baris dengan nama pelanggan sama digabung jadi satu tagihan) dan header-nya persis nama kolom yang dibaca. Kolom `No urut` & `harga` ditulis sebagai angka (bukan teks) supaya Excel memperlakukannya sebagai bilangan. Tombol yang sama juga muncul di layar "file belum bisa dipakai" dan "baris belum benar", biar user bisa langsung memakai format yang benar.
- **Kolom yang dibaca**: `No urut`, `Nama-no wa`, `item`, `harga`. **Urutan kolom bebas** dan kolom yang tidak dipakai (mis. `No urut`) boleh ada di mana saja — pencocokannya lewat **nama header**, bukan posisi:
  - `harga`/`price` → harga asli barang. Nilai `15.000`, `15000`, `Rp 15.000`, dan angka asli dari Excel dua-duanya diterima.
  - `item`/`barang`/`produk` → nama barang.
  - `nama` + `wa`/`hp`/`telp`/`nomor` dalam satu header (mis. `Nama-no wa`) → nama pelanggan dan nomor WA dipisah dari satu sel (pemisah `-`, `|`, atau tanda kurung). Kalau header nama & nomor dipisah jadi dua kolom, itu juga dikenali. Header `Nama Barang` sengaja dibaca sebagai kolom **barang**, bukan nama pelanggan.
  - Baris header boleh tidak di baris pertama (mis. ada judul di atasnya) — header pertama yang memuat minimal kolom `item` + `harga` yang dipakai.
- **Satu pelanggan = satu tagihan**: baris-baris dengan nama pelanggan yang sama (dicocokkan tanpa membedakan huruf besar/kecil) dikumpulkan jadi satu pesanan. Baris dengan nama barang, harga, dan fee yang sama persis digabung jadi satu baris dengan qty dijumlahkan.
- **Fee jastip tidak diambil dari file** — selalu dihitung dari **Aturan Fee event ini** pakai rumus yang sama dengan form Tambah Pesanan (harga asli dicocokkan ke tier, lihat _Logika auto-fill fee_ di §7). Kalau event belum punya Aturan Fee, atau harganya di luar semua tier, fee-nya **0** (bukan dikosongkan, karena di import tidak ada yang bisa mengisi manual). Fee berlaku per barang dan ikut dikalikan qty: total = `(harga asli + fee) × qty`.
- **Semua hasil import masuk sebagai Belum Lunas** (`paidAmount = 0`); status pembayarannya ditandai setelahnya seperti pesanan biasa. Pelanggan yang sudah punya pesanan **belum lunas/DP** di event ini tidak dibikin tagihan baru — barangnya **digabung** ke pesanan itu pakai aturan gabung yang sama (`order-merge.ts`), termasuk membawa nominal DP yang sudah masuk dan checklist `obtained` barang lama.
- **Preview dulu, baru import**: setelah file dipilih, file-nya dibaca **di browser** (isinya tidak diupload) dan yang tampil adalah ringkasan (jumlah pelanggan, jumlah barang, total tagihan, nama file), keterangan fee dari aturan mana, peringatan berapa pelanggan yang bakal digabung, lalu daftar pesanan beserta barang + fee-nya. Tombol **Import** baru aktif kalau tidak ada masalah.
- **Baris bermasalah tidak dibuang diam-diam**: baris yang tidak bisa dibaca (mis. nama pelanggan/barang kosong, harga bukan angka atau negatif) dicatat **per nomor baris seperti di Excel** dan **memblokir seluruh import** — user diminta memperbaiki filenya lalu memilih ulang. Jadi tidak ada data yang "hilang sebagian" tanpa disadari.
- **Batas**: maksimal **2.000 baris** dan **500 pelanggan** sekali import (`MAX_IMPORT_ROWS` / `MAX_IMPORT_ORDERS` di `lib/order-import.ts`, sekaligus jadi batas validator di server). Lewat dari itu, file-nya ditolak dengan saran dipecah jadi beberapa file — pesannya menyebut angka batasnya.
- **Satu transaksi**: seluruh pesanan ditulis dalam satu `db.transaction` di `importOrders`, jadi tidak ada import yang masuk setengah jalan. Setelah selesai, halaman event menyegarkan datanya dan menampilkan alert melayang yang sama seperti penggabungan pesanan (mis. "Import selesai: 12 pesanan baru, 3 pelanggan digabung ke pesanan yang belum lunas (27 barang).").
- **Back menutup modal ini**, bukan meninggalkan halaman (modal state lokal, pakai `useBackToClose`, lihat 6.1).

#### 4.3.3 Export Data Pesanan per Event

Buat jastiper yang butuh rekap pesanan satu event di luar aplikasi (mis. dikirim ke pemasok atau diolah lagi di Excel).

- **Masuknya dari menu tiga titik (⋮)** di halaman Detail Event: item **"Export data (Excel)"**, tepat di bawah Import data. Tombolnya **nonaktif** kalau event belum punya pesanan (dengan keterangan pengganti "Belum ada pesanan untuk diexport."); event yang sudah **nonaktif** tetap bisa diexport karena export cuma membaca data.
- **Satu baris = satu barang**. Kolomnya, urut seperti di file: `No urut`, `Nama`, `No WA`, `Item`, `Harga`, `Fee`, `Qty`, `Total`. `No urut` = nomor baris 1..N di dalam file (pelanggan yang barangnya lebih dari satu muncul di beberapa baris). `Nama`/`No WA` diulang di setiap baris supaya file-nya enak difilter di Excel; `No WA` jadi sel kosong kalau pelanggannya belum punya nomor.
- **Angka, bukan teks**: `Harga`, `Fee`, `Qty`, dan `Total` ditulis sebagai bilangan asli sehingga bisa langsung dijumlahkan di Excel. `Total` = `(Harga + Fee) × Qty` — rumus `lineTotal()` yang sama dipakai di form pesanan, detail event, dan invoice.
- **Isinya disusun `buildOrderExportRows()` di `lib/order-export.ts`** (murni: cuma array-of-arrays, tanpa db/browser/library Excel), lalu file-nya dibikin SheetJS `xlsx` (`utils.aoa_to_sheet()` → `book_new()` → `book_append_sheet()` → `writeFile()`) dengan sheet bernama **`Pesanan`**. Library `xlsx` di-`import()` **dinamis di dalam handler** — pola yang sama dengan unduh template import (lihat 4.3.2 & 6.4).
- **Urutan baris**: dikelompokkan per nama pelanggan (diurutkan tanpa membedakan huruf besar/kecil) supaya hasil export-nya stabil dan tidak ikut urutan yang dikirim database; urutan barang **di dalam** satu pesanan dibiarkan apa adanya.
- **Nama file**: `pesanan-<nama-event>.xlsx`, dengan nama event dibersihkan jadi huruf kecil & tanda hubung (`orderExportFileName()`); nama yang isinya cuma simbol/jarak jatuh ke `pesanan-event.xlsx`. Setelah file terunduh muncul alert melayang: "Export selesai: N baris barang dari M pesanan."
- Tidak ada gerbang paket di fitur ini: datanya sudah tersedia di halaman event, jadi export bisa dipakai semua user (server tidak dipanggil sama sekali).

### 4.4 Tambah / Edit Pesanan (Bottom Sheet)

- Context: event terkait (chip, non-editable).
- **Nama pelanggan** — autocomplete dari daftar Customer yang tersimpan (nama + no. HP). Bisa diisi bebas jika belum terdaftar. Saran otomatis ini fitur PRO `customer_suggestions`: di paket FREE nama pelanggan tetap bisa diketik manual dan di tempat saran muncul keterangan bahwa saran pelanggan tersedia di paket PRO (server tidak mengirim datanya sama sekali — lihat 5).
- **No. HP pelanggan** — opsional, dipakai untuk kirim WA dari halaman Invoice.
- Barang titipan — repeatable block: nama barang, harga asli, jumlah (qty), fee jastip.
  - **Fee auto-terisi** berdasarkan Aturan Fee event ini + harga barang yang diinput (lihat 4.9). Bila harga di luar semua tier, field fee dikosongkan untuk diisi manual.
  - **Fee berlaku per unit**: total satu barang = `(harga asli + fee) × qty`. Contoh: barang 30.000 + fee 4.000, qty 2 → (30.000 + 4.000) × 2 = 68.000.
  - **Saran nama barang & harga asli** — saat mengisi nama barang, muncul saran dari barang yang pernah dicatat di event ini (nama + daftar harga), diambil dari server (`getOrderSuggestions`). Ini fitur PRO `order_suggestions`: kalau terkunci, field tetap bisa diisi manual dan di tempat saran muncul keterangan "Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO" — server tidak mengirim data saran sama sekali ke user FREE (lihat 5).
  - **Toggle "Bundling" (satu harga untuk beberapa barang)** — untuk paket seperti "100/3 item". Kalau dinyalakan, field "Nama barang" berubah jadi daftar nama bernomor (mis. `Kaos` / `Celana` / `Topi`) dengan tombol **Tambah barang** dan hapus per baris. **Harga asli & fee tetap per paket** — pakai field **Jumlah** untuk berapa paket yang dibeli (mis. 2 paket × (100.000 + fee 5.000) = 210.000). Slot nama yang dikosongkan otomatis dibuang waktu disimpan.
    - Cara simpannya: nama-nama itu digabung jadi **satu nama** `"Kaos + Celana + Topi"` di satu baris `items.name` — jadi semua halaman (invoice, tagihan, checklist belanja, saran nama) tetap jalan **tanpa perubahan skema**. Aturannya di `lib/item-bundle.ts`.
    - Pesanan lama yang namanya mengandung `" + "` otomatis dibuka dengan toggle ini **aktif** (nama dipecah lagi jadi beberapa input), dan waktu disimpan digabung lagi jadi string yang sama.
    - Kalau toggle dimatikan lagi, semua nama digabung jadi satu nama barang (tidak ada yang hilang).
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
- Card invoice: nama brand/jastiper, no. invoice (8 karakter UUID), nama pelanggan, nama event, tanggal invoice, daftar item (qty × harga + fee), total tagihan. **Nama barang dibiarkan membungkus (wrap), tidak dipotong dengan elipsis** — supaya nama paket bundling panjang (mis. "Kaos + Celana + Topi") tetap terbaca utuh.
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

- **Mode gelap** — toggle, disimpan di `localStorage` + `data-theme` attribute. **Default terang**: kalau user belum pernah memilih (belum ada nilai `localStorage.theme`), app dibuka terang walaupun HP-nya mode gelap — auto gelap (ikut `prefers-color-scheme`) tidak dipakai sebagai default. Script inline `buildThemeInitScript` (`src/lib/theme.ts`, dipasang `__root.tsx`) yang menentukan tema sebelum hydrate, dan `ThemeToggle.tsx` memakai konstanta `DEFAULT_THEME_MODE` yang sama.
- **Template Chat WA** (halaman `/profil/template-chat`, form `MessageTemplateForm`) — template pesan WhatsApp untuk tagih pelanggan, dengan variabel `{customer}`, `{event}`, `{link}`, `{subtotal}`, `{fee}`, `{total}`, `{bank}`, `{bankAccount}`, `{brand}`. Bisa dikembalikan ke default. Dulu form ini modal; dipindah jadi halaman sendiri (header + tombol back, bottom nav tetap tampil seperti `/profil/langganan`) karena di sebagian HP tinggi kontennya — textarea + chips variabel + preview — bikin tombol Simpan ketutup.
- Item **Notifikasi** dan **Tambahkan ke layar utama** (prompt install PWA) sudah **dihapus** dari section ini: yang pertama cuma placeholder tanpa isi, yang kedua dianggap tidak perlu karena install tetap bisa dari menu browser (Chrome: ikon Install di address bar; iPhone: Share → "Tambahkan ke layar utama").

#### 4.8.6 Tombol Keluar

- Tombol **Keluar** (logout) — satu-satunya isi bagian bawah halaman profil.
- Item **Bantuan** dan **Tentang aplikasi** (versi `v1.0.0`) sudah **dihapus** dari halaman profil beserta judul section "Lainnya": dua-duanya cuma placeholder tanpa isi, jadi cuma menambah tinggi halaman.

### 4.9 Manajemen Fee — `/profil/fee-rules`

- List aturan fee: card per aturan — nama, jumlah tier, rentang harga, preview tier. Tombol "Tambah aturan fee".
- **Tambah / Edit Aturan Fee** — nama aturan + list tier (bisa tambah/hapus baris). Tiap tier: harga min, harga maks, fee jastip.
- **Saran tier otomatis** (dipakai di form Tambah **dan** Edit aturan fee) — dari harga dan fee barang yang pernah dicatat user, sistem mengelompokkan harga ke rentang (band) lalu menyarankan satu tier per rentang dengan fee = nilai tengah rentang tersebut (dibulatkan). Ini fitur PRO `fee_suggestions`: di paket FREE panel saran diganti keterangan "Saran tier otomatis dari riwayat harga & fee barang tersedia di paket PRO", dan server (`getFeeSuggestions`) cuma mengirim `unlocked: false` tanpa data (lihat 5.2).

> **Pembaruan:** panel saran ini sekarang **hanya ada di form Tambah aturan fee**. Di halaman **Edit aturan fee** sudah dihapus — tier-nya toh sudah terisi dari aturan yang sedang diedit, jadi daftar saran cuma jadi noise (dan bikin ragu tier mana yang sebenarnya berlaku). Halaman edit juga tidak lagi memanggil `getFeeSuggestions`.

- User bisa membuat **lebih dari satu aturan fee** (misal beda aturan untuk jastip lokal vs luar negeri).
- Di Detail Event, user memilih **satu Aturan Fee** yang berlaku untuk event tersebut.

**Contoh data nyata (referensi user, "Fee jastip by ALAKA"):**

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
- Rekomendasi: tier berikutnya harus mulai dari `tier_sebelumnya.max + 1`. Di form Tambah/Edit, tombol **Tambah tier** otomatis mengisi harga min tier baru = `harga maks tier terakhir + 1` (helper `nextTierMinPrice` di `fee-tier-validation.ts`), jadi user tinggal mengisi harga maks & fee.
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
punya layout sendiri: tanpa bottom nav member, header sendiri yang cuma berisi
identitas "Admin ALAKA", dan navigasi antar halaman admin dipasang sebagai
**bottom tab** — Dashboard / Customer / Pengaturan — lihat di bawah). Halaman
dashboard-nya fokus ke **ringkasan user** dan **verifikasi pengajuan**; daftar
customer pindah ke halaman sendiri (4.15), sedangkan pengaturan pembayaran PRO dan
tombol **Keluar** ada di 4.14.
User biasa yang membuka `/admin` di-redirect ke `/`; sebaliknya user admin yang
membuka halaman member (`_app`) langsung dipindahkan ke `/admin`, dan login / callback
Google admin juga mendarat di `/admin`.

Proteksi berlapis: `beforeLoad` di route cuma UX (redirect), sedangkan pagar yang
mengikat ada di server — **setiap** server function admin memanggil
`requireAdminUser()` (`src/lib/admin.ts`) di baris pertama handler-nya dan melempar
`AdminRequiredError` (`code = 'ADMIN_REQUIRED'`) kalau bukan admin.

**Kartu metrik** (`getAdminMetrics`) — selalu **2 kartu per baris**, bukan menumpuk
satu-satu. Grid-nya sengaja memakai `grid grid-cols-2` polos, **bukan**
`sm:grid-cols-2`: `sm:` itu breakpoint **viewport**, bukan lebar container. Karena
shell-nya sudah dibatasi 480px (lihat di bawah), viewport ponsel — tempat aplikasi ini
paling sering dipakai — selalu di bawah 640px, sehingga `sm:grid-cols-2` tidak pernah
aktif dan kartunya jatuh menumpuk satu per baris walau sebenarnya 480px cukup untuk
dua kartu. Dengan `grid-cols-2` polos, dua kartu per baris berlaku di semua ukuran.

Layout admin memakai kelas `app-shell app-shell--with-nav`: lebar tetap dihitung
`.app-shell` di `src/styles.css` (maks 480px, sama seperti shell member), sedangkan
`--with-nav` menyediakan `padding-bottom: calc(6rem + env(safe-area-inset-bottom))`
supaya isi paling bawah (mis. tombol **Keluar** di Pengaturan) tidak tertutup nav
yang `fixed` di mobile.

**Navigasi admin = bottom tab** (`src/components/AdminBottomNav.tsx`, bentuknya
meniru `BottomNav.tsx` member: fixed, maks 480px, aman dari safe-area):

| Tab        | Route               | Isi                                     |
| ---------- | ------------------- | --------------------------------------- |
| Dashboard  | `/admin`            | Ringkasan metrik + verifikasi           |
| Customer   | `/admin/customers`  | Daftar semua customer (4.15)            |
| Pengaturan | `/admin/pengaturan` | Harga & QRIS PRO + tombol Keluar (4.14) |

Halaman aktif ditentukan dari `pathname` yang trailing slash-nya dirapikan, bukan
lewat `activeProps`: kecocokan route bawaan TanStack Router itu berawalan (prefix),
jadi tab Dashboard (`/admin`) ikut menyala saat admin sedang di `/admin/customers`.
Cara yang sama juga memperlakukan `/admin` dan `/admin/` sebagai satu halaman
(router memang me-redirect `/admin/` → `/admin`). Karena header sudah bebas dari
tautan navigasi, tautan "← Dashboard" lama dihapus — pindah halaman cukup lewat tab.

| Kartu        | Isi                                                                                                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Users  | Jumlah seluruh user terdaftar                                                                                                                                                                                                                                                                                                    |
| Active Users | User yang punya sesi login baru dalam **7 hari** terakhir (`count(distinct user_id)` dari `sessions`; jendelanya konstanta `ACTIVE_USER_WINDOW_DAYS` dan nilainya ikut dikirim ke client sebagai `activeWindowDays` supaya hint kartu tidak bisa beda dari query-nya), bukan dari `activity_logs` yang belum diisi kode mana pun |
| PRO Active   | Baris `subscriptions` berstatus `active` **dan** `ends_at`-nya belum lewat                                                                                                                                                                                                                                                       |
| PRO Pending  | Pengajuan berstatus `pending`                                                                                                                                                                                                                                                                                                    |
| PRO Revenue  | `SUM(amount)` dari semua pengajuan yang **pernah disetujui** (`active` + `expired`), diformat Rupiah                                                                                                                                                                                                                             |

Dashboard tidak punya pintasan khusus ke daftar customer: tab **Customer** di bottom
nav selalu terlihat, jadi angka "Total Users" bisa ditelusuri lewat tab itu (4.15).

**Verifikasi langganan PRO**:

- Daftar pengajuan **lintas semua user**, terbaru dulu, difilter dengan tab **Pending / PRO Aktif / Semua** (filter di client). Kalau ada pengajuan menggantung sementara tab aktif bukan Pending, muncul tombol pintasan "Tinjau N pengajuan pending".
- Tiap kartu pengajuan menampilkan identitas user (nama + brand + email), nominal, tanggal bayar, tautan bukti transfer, badge status, dan tombol **Setujui / Tolak**.
- **Setujui** (`approveSubscription`): baris `pending` jadi `active` dengan jendela masa aktif dihitung `nextProWindow()` — perpanjangan menyambung dari `ends_at` yang masih berlaku, bukan dari hari ini — plus `reviewed_by`, `reviewed_at`, dan catatan review.
- **Tolak** (`rejectSubscription`): status jadi `rejected` + catatan review.
- Pengajuan yang sudah pernah diproses tidak bisa diproses ulang (server menolak dengan "Pengajuan ini sudah diproses sebelumnya"). Catatan review diisi lewat `ReviewSubscriptionModal` (mode approve / reject).

### 4.14 Pengaturan Admin — `/admin/pengaturan`

Halaman terpisah di dalam layout admin yang sama (`src/routes/admin/pengaturan.tsx`),
dibuka lewat **tab Pengaturan** di bottom nav admin. Isinya semua yang bukan
aktivitas harian admin:

- **Pengaturan Pembayaran PRO** (kartu utama, pindahan dari dashboard):
  - **QRIS Pembayaran** — upload / ganti gambar QRIS yang dipakai member saat mengajukan upgrade (`UpdateQrisModal`), maks 1.5MB (PNG/JPEG/WEBP). Kalau belum ada QRIS, kartunya memberi tahu bahwa member belum bisa mengajukan upgrade.
  - **Harga Membership** — nominal yang wajib ditransfer member, bisa diubah inline lewat `subscriptionSettingsQuery` (query key `admin-subscription-settings`, di-load di loader route ini). Perubahan harga **hanya berlaku untuk pengajuan baru** (lihat 5.7).
- **Tombol Keluar** di bawah kartu — dulu ada di header layout admin, sekarang tinggal di sini (`logoutUser()` → redirect `/login`).

Karena halaman ini yang membaca `fetchSubscriptionSettingsAdmin()`, dashboard tidak
lagi menyentuh pengaturan pembayaran sama sekali — loader `/admin` cuma butuh metrik
dan daftar pengajuan.

### 4.15 Daftar Customer (Admin) — `/admin/customers`

Daftar **semua akun** yang terdaftar di aplikasi (`src/routes/admin/customers.tsx`),
dibuka lewat **tab Customer** di bottom nav admin (4.13). Fokusnya: siapa orangnya,
status langganannya, apakah masih aktif login, dan berapa total uang yang sudah
masuk dari dia.

Data datang dari satu server function `fetchAdminUsers` → `listAdminUsers()`
(`src/lib/admin-queries.ts`, query key `admin-users`, di-`ensureQueryData` di loader
route). Isi tiap baris:

| Kolom             | Sumber                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Nama / email      | `users.name`, `users.email`, plus `brand_name` sebagai judul kartu                                                         |
| Plan + PRO sampai | `resolveEntitlement()` — aturan trial/FREE/PRO **tidak** ditulis ulang di query (lihat 5.1)                                |
| Pending           | Ada `subscriptions` berstatus `pending` (badge kuning)                                                                     |
| Status aktif      | Ada sesi login dalam **7 hari** terakhir (`ACTIVE_USER_WINDOW_DAYS`), sama ambangnya dengan kartu "Active Users" di 4.13   |
| Login terakhir    | `max(sessions.created_at)` per user                                                                                        |
| Total revenue     | `SUM(amount)` dari langganan yang pernah disetujui (`active` + `expired`) — definisi yang sama dengan metrik "PRO Revenue" |
| Terdaftar         | `users.created_at`                                                                                                         |

Detail teknis:

- **Digabung di memori, bukan lewat `join`.** Semua user diambil sekali, lalu jumlah
  langganan / revenue / login terakhir diambil sebagai query agregat terpisah
  (per user) dan dipetakan ke peta (`Map`) — join langsung ke `users` akan
  menggandakan baris user dan bikin `SUM`-nya salah. Alasan yang sama dipakai di
  metrik dashboard.
- **`last_login_at` wajib lewat helper `max()` dari drizzle**, bukan `sql` mentah:
  driver `pg` di sini dikonfigurasi drizzle untuk mengembalikan kolom tanggal sebagai
  **string**, dan mapping tipe kolom itulah yang mengubahnya jadi `Date`. `sql\`max(...)\``mentah tidak dipetakan, sehingga`isActive` gagal (`getTime is not a function`).
- **Tab & urutan di client** (tanpa round-trip server): tab **Semua / PRO / Trial /
  Pending / FREE** dengan jumlah per tab, kotak cari nama/email, dan pengurutan
  **Terbaru** (default, `created_at` menurun) ↔ **Revenue tertinggi**. Tab Pending
  sengaja terpisah dari tab plan karena pengajuan bisa nempel di plan apa pun.
- Halaman ini **read-only**: tindakan admin (setujui/tolak) tetap di dashboard 4.13.

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
| `fee_suggestions`      | Saran tier aturan fee di form Tambah Aturan Fee                    | `getFeeSuggestions` mengembalikan `unlocked: false` + data kosong                                                                       |
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
- Kontrol yang tampil terkunci di paket FREE: tombol **Tagih** di Detail Event (gembok + badge PRO; klik = dialog upgrade), tombol "Tambah metode pembayaran" serta toggle aktif-nonaktif metode (semua aksi tulis dialihkan ke dialog upgrade), lalu keterangan pengganti saran di form pesanan ("Saran nama barang & harga dari riwayat pesanan tersedia di paket PRO"), di form Tambah aturan fee ("Saran tier otomatis dari riwayat harga & fee barang tersedia di paket PRO"; halaman Edit aturan fee tidak lagi memakai saran ini), dan untuk saran pelanggan ("Saran nama & no. HP pelanggan dari data customer tersedia di paket PRO").
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

- Harga membership PRO **bukan konstanta di kode**: disimpan di tabel singleton `subscription_settings` (`pro_price`) dan diubah admin dari `/admin/pengaturan` (lihat 4.14). Durasi PRO tetap konstanta `PRO_DURATION_DAYS` (30 hari).
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

### 6.1 Tombol back: modal & bottom sheet

Tombol back (hardware/browser, termasuk swipe-back) dipakai buat **menutup overlay**, bukan ninggalin halaman. Ada dua mekanisme, dipilih sesuai sumber state overlay-nya:

- **Overlay yang punya URL sendiri** — sheet Tambah/Edit Pesanan di halaman event. Buka/tutupnya ditentukan search param (`?addOrder` / `?editOrder` / `?duplicateOrder`, lihat 4.3 dan `lib/order-sheet-search.ts`), jadi back cukup mem-pop history dan sheet-nya ketutup sendiri tanpa kode tambahan.
- **Modal lain** (semua dialog: konfirmasi hapus, konfirmasi hapus event, nominal DP, import data Excel/CSV, edit profil, ubah kata sandi, form customer, edit/tambah metode pembayaran, ajukan upgrade & verifikasi langganan, QRIS pembayaran, dialog fitur PRO) — state-nya lokal per halaman, jadi ditangani hook `useBackToClose(open, onClose)` (`src/lib/back-to-close.ts`). Hook ini dipasang **di dalam komponen modalnya**, bukan di halaman pemanggil, supaya semua pemakaian ikut kebagian tanpa baris tambahan di tiap halaman.

Cara kerja `useBackToClose`: pakai `useBlocker` TanStack Router — selama modal terbuka, navigasi `BACK` **ditahan** (URL & history tetap di halaman yang sama) lalu `onClose()` dipanggil. Yang **tidak** diganggu: navigasi `PUSH`/`REPLACE` (pindah halaman sesudah menyimpan, tombol upgrade PRO) dan `history.go()` dari kode. Prompt "yakin mau keluar?" waktu tab di-refresh/ditutup juga dimatikan (`enableBeforeUnload: false`) — yang ditangani cuma tombol back.

Detail perilaku lain:

- Modal bertumpuk: **cuma modal paling atas** yang mengambil alih back (daftar LIFO di `back-to-close.ts`, diuji `back-to-close.test.ts`), jadi back menutup satu per satu dari yang paling atas.
- Waktu modal sedang sibuk (mis. tombol hapus lagi loading), `onClose` di halaman pemanggil memang di-guard — sama seperti tap backdrop / Esc, back tidak melakukan apa-apa sampai prosesnya selesai.
- Sheet Tambah/Edit Pesanan **tidak** pakai hook ini (dobel dengan mekanisme URL di atas); tutup lewat X/Simpan mem-pop entry history yang tadi di-push, sedangkan kalau sheet datang dari link langsung URL-nya cukup di-replace supaya user tetap di halaman event.

Halaman admin tidak ikut skema tab di atas: `/admin` (dan sub-halamannya) memakai
layout sendiri di luar shell member, **tanpa** bottom nav member, dengan header
sendiri yang cuma berisi identitas "Admin ALAKA". Navigasi antar halaman admin
dipasang sebagai **bottom tab sendiri** (`AdminBottomNav`, 3 tab: **Dashboard /
Customer / Pengaturan**, halaman aktif ditandai warna aksen). Tombol **Keluar** ada
di `/admin/pengaturan`, bukan di header. User dengan `is_admin = true` yang membuka
halaman member otomatis dipindahkan ke `/admin`, dan login / callback Google admin
mendarat di `/admin` (lihat 4.13–4.15).

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
- **Barang bundling disimpan sebagai satu baris `items`**: nama-nama barang dalam satu paket digabung jadi satu string dipisah `" + "` (mis. `"Kaos + Celana + Topi"`), jadi `items.name` tidak perlu kolom baru dan harga/fee tetap per paket (`lib/item-bundle.ts`).
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

> **⚠️ ATURAN PRODUKSI — jangan migrasi Neon tanpa konfirmasi.**
>
> `pnpm db:migrate:neon` mengubah database **produksi** yang sudah dipakai user
> nyata. Jangan pernah menjalankannya atas inisiatif sendiri, termasuk sebagai
> langkah "sekalian" di tengah tugas lain:
>
> 1. **Minta konfirmasi dulu** ke pemilik aplikasi. Tunjukkan file migrasinya, jelaskan dampaknya ke data & kode, baru jalankan setelah diizinkan.
> 2. **Produksi harus maju bersamaan dengan deploy kode — bukan mendahuluinya.** Kalau DB berubah tapi kode yang live masih versi lama, terjadi ketidakcocokan skema yang membingungkan user. Contoh nyata: DB sudah kolom `timestamptz`, sementara kode live masih menganggapnya `timestamp` / belum pakai `APP_TIME_ZONE`.
> 3. Aplikasi **tidak** menjalankan migrasi otomatis saat start, jadi migrasi produksi = **langkah rilis yang disengaja**, bukan bagian dari "supaya tes saya lewat".
> 4. Migrasi lokal (`jastip_dev`) bebas dilakukan kapan saja — batasannya khusus database produksi.
>
> **Insiden `0006_timestamps_to_timestamptz` (dicatat agar tidak terulang):**
> migrasi ini sudah diterapkan ke Neon (`neondb`) — 31 kolom `timestamp` →
> `timestamptz` + `ALTER DATABASE neondb SET timezone TO 'Asia/Jakarta'` —
> **sebelum** kode-nya naik ke produksi, sehingga produksi sempat berjalan
> dengan DB di depan kode. Data sendiri **tidak bergeser** (min/max epoch
> identik sebelum vs sesudah, 7 tabel, lokal & Neon), jadi yang salah murni
> **urutan rilisnya**, bukan isinya.
>
> Kalau perlu dikembalikan ke keadaan sebelum `0006` (tanpa menggeser data —
> ini kebalikan eksak dari `USING ... AT TIME ZONE 'UTC'`):
>
> ```sql
> ALTER TABLE "orders" ALTER COLUMN "created_at"
>   SET DATA TYPE timestamp USING "created_at" AT TIME ZONE 'UTC';
> -- ...ulangi untuk 30 kolom lainnya...
> ALTER DATABASE neondb RESET timezone;
> ```
>
> Setelah produksi di-rollback, `src/db/schema.ts` juga harus ikut dikembalikan
> ke `timestamp` (tanpa `withTimezone`) supaya skema kode dan DB tidak mismatch.

**Catatan operasional:**

- Aplikasi **tidak** menjalankan migrasi otomatis saat start (`src/db/index.ts` cuma membuat koneksi), jadi `pnpm db:migrate` harus dijalankan manual setelah deploy.
- Nama file bawaan drizzle-kit berupa kode acak (`0000_greedy_thing.sql`); `0002_add_users_is_admin.sql`, `0003_add_customers_address.sql`, dan `0004_add_events_is_active.sql` di-rename manual supaya mudah dibaca. Rename file `*.sql` boleh, asal `tag` pada `drizzle/meta/_journal.json` ikut disesuaikan.
- **Migrasi `0003` menyusul celah lama**: tabel `subscription_settings` (dari commit "feat(admin): implement admin dashboard and subscription management") sebelumnya dibuat langsung di database lewat `db:push` sehingga tidak punya file migrasi — makanya tabel itu ikut ter-generate di `0003`. Statement-nya sengaja dibuat idempotent (`CREATE TABLE IF NOT EXISTS` + cek `pg_constraint`) supaya jalur database yang tabelnya sudah ada (lokal & produksi, sudah berisi data) dan database yang dibangun dari nol dua-duanya aman. Kalau ada DB yang perubahan skemanya sudah ada tapi belum tercatat di `drizzle.__drizzle_migrations`, tandai dulu dengan `pnpm db:baseline --tag=<tag>` (mis. `--tag=0002_add_users_is_admin`) sebelum `pnpm db:migrate`.
- Untuk database yang skemanya **sudah ada duluan** (dibuat lewat `db:push` sebelum folder `drizzle/` dipakai), jalankan `pnpm db:baseline` (atau `pnpm db:baseline --tag=0000_greedy_thing`) sekali supaya migrasi lama tidak dijalankan ulang dan tabel/data yang sudah ada tidak tersentuh — lihat `scripts/drizzle-baseline.ts`.
- `pnpm db:studio` tetap boleh dipakai untuk mengubah **data** (mis. menandai `users.is_admin = true`), tapi bukan untuk mengubah skema.
- **Neon = produksi, dan migrasi ke sana butuh izin dulu.** Lihat blok "⚠️ ATURAN PRODUKSI" di atas. Status `0006_timestamps_to_timestamptz` saat catatan ini ditulis: sudah ter-apply di lokal (`jastip_dev`) **dan** di Neon (`neondb`), sedangkan perubahan kode pendampingnya (`src/db/schema.ts` → `withTimezone: true`, `src/lib/timezone.ts`, pemakaian `timeZone: APP_TIME_ZONE`) belum di-deploy.

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

Aturan yang sama dipakai **import data pesanan dari Excel/CSV** (§4.3.2), tapi
karena di sana tidak ada yang bisa mengisi manual, harga di luar semua tier
(tidak ketemu) atau event yang belum punya aturan fee menghasilkan **fee 0**.

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
│   ├── AdminBottomNav.tsx      # Bottom tab admin (Dashboard/Customer/Pengaturan)
│   ├── BottomNav.tsx           # Bottom tab navigation
│   ├── ChangePasswordModal.tsx
│   ├── CustomerFormModal.tsx
│   ├── EditProfileModal.tsx
│   ├── FeeRuleForm.tsx         # Form tambah/edit aturan fee + tier
│   ├── ImportOrdersModal.tsx   # Modal import pesanan dari Excel/CSV (menu ⋮ halaman event)
│   ├── MessageTemplateForm.tsx  # Form Template Chat WA (halaman /profil/template-chat)
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
│   ├── admin-functions.ts     # Metrik, daftar customer & pengajuan, approve/reject, QRIS & harga PRO
│   ├── admin-queries.ts       # Query metrik admin + daftar customer + pengajuan lintas user (server)
│   ├── auth.ts                # getSessionUser, session management
│   ├── auth-functions.ts      # login, register, logout, updateProfile, changePassword
│   ├── back-to-close.ts       # Hook `useBackToClose`: tombol back menutup modal (TanStack useBlocker)
│   ├── back-to-close.test.ts  # Unit test daftar modal terbuka (LIFO: cuma yang paling atas ambil back)
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
│   ├── item-bundle.ts         # Gabung/pecah nama barang bundling (murni, tanpa db)
│   ├── item-bundle.test.ts    # Unit test logika paket bundling
│   ├── mailer.ts              # Kirim email reset password
│   ├── message-template.ts    # DEFAULT_WA_MESSAGE_TEMPLATE, renderMessageTemplate
│   ├── message-template-functions.ts
│   ├── order-import.ts        # Baca file import Excel/CSV + isi template .xlsx (murni, tanpa db)
│   ├── order-import.test.ts   # Unit test parsing file, deteksi header, fee, batas & template import
│   ├── order-import-functions.ts  # importOrders: tulis hasil import (satu transaksi)
│   ├── order-export.ts        # Susun baris export pesanan per event (murni, tanpa db)
│   ├── order-export.test.ts   # Unit test isi file & nama file export pesanan
│   ├── order-merge.ts         # Aturan gabung pesanan pelanggan yang sama (murni, tanpa db)
│   ├── order-merge.test.ts    # Unit test penggabungan pesanan
│   ├── order-sheet-search.ts  # Kontrak URL sheet Tambah/Edit Pesanan (back = tutup sheet)
│   ├── order-sheet-search.test.ts  # Unit test kontrak URL sheet
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
│   ├── subscription-settings-queries.ts  # Harga & QRIS PRO — baris tunggal (server)
│   ├── theme.ts               # DEFAULT_THEME_MODE (terang) + buildThemeInitScript (murni)
│   └── theme.test.ts          # Unit test default tema & script init (sandbox node:vm)
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
│   │       ├── template-chat.tsx  # Template Chat WA (dulu modal)
│   │       ├── customers/index.tsx
│   │       ├── fee-rules/index.tsx
│   │       ├── fee-rules/new.tsx
│   │       └── fee-rules/$feeRuleId.tsx
│   ├── admin.tsx              # Layout admin (guard is_admin + AdminBottomNav, header identitas)
│   ├── admin/
│   │   ├── index.tsx          # Dashboard admin (metrik user, verifikasi pengajuan)
│   │   ├── customers.tsx      # Daftar semua customer (plan, aktivitas, revenue)
│   │   └── pengaturan.tsx     # Pengaturan pembayaran PRO (QRIS + harga) + tombol Keluar
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
- Library yang **khusus browser** di-`import()` dinamis di dalam handler-nya, bukan di-import di level modul, supaya tidak ikut bundle awal dan tidak pernah jalan saat SSR — contohnya `read-excel-file/browser` (baca file import) dan `xlsx`/SheetJS (bikin file template) di `ImportOrdersModal.tsx` (file-nya di-parse/dibuat di client, server cuma menerima hasil parse-nya).

## 9. Di Luar Cakupan MVP (Next Phase)

- Tab Pesanan (list & filter lintas event).
- **Penyempurnaan alur PRO**: job yang menandai baris `subscriptions` jadi `expired` saat `ends_at` lewat, pengingat perpanjangan, serta tindakan admin lanjutan (beri/cabut PRO manual tanpa pengajuan, ubah durasi per user). Pengajuan dari dalam aplikasi + panel verifikasinya sendiri **sudah ada** (lihat 4.12, 4.13, 5.6).
- Reminder otomatis ke pelanggan yang belum lunas (WhatsApp API / bot).
- Payment gateway (pembayaran online) — untuk MVP masih manual/transfer.
- Verifikasi email saat register.
- Aplikasi mobile native — MVP web/PWA saja.
- Ekspor Data (kebalikannya: unduh data event/pesanan jadi file). Import dari Excel/CSV **sudah ada** (lihat 4.3.2).
- Master Control & Activity Logs (tabel `activity_logs` sudah ada di DB, tapi belum ada UI maupun kode yang menulis ke sana — karena itu metrik "Active Users" di dashboard admin sementara dihitung dari baris `sessions`).
- Notifikasi push (service worker sudah ada via Workbox, tapi belum diimplementasi).
