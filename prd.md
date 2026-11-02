# PRD — ALAKA (PWA)

## 1. Ringkasan Produk

**ALAKA** adalah aplikasi manajemen jastip (titip beli) berbasis web, mobile-first,
dan bisa diinstall sebagai PWA. Ditujukan untuk jastiper yang saat ini mengelola
pesanan secara manual (spreadsheet/chat), agar bisa mengelola event belanja,
pesanan pelanggan, dan keuangan dalam satu tempat.

Aplikasi bersifat **multi-tenant berbasis brand**. Satu **brand** = satu "toko"
jastip: pemilik semua data bisnis (event, pesanan, customer, aturan fee, metode
pembayaran, langganan, foto & nama brand). Akun orang (`users`) hanya menempel ke
satu brand. Siapa saja bisa mendaftar dan otomatis menjadi **owner** brand
barunya; owner boleh mengundang **admin brand** (anggota tim yang mengurus
operasional harian) lewat email (lihat 4.16). Data antar brand terisolasi total.

Ada **tiga jenis pengguna**, masing-masing dengan area dan login sendiri
(semuanya masuk lewat halaman `/login` yang sama):

| Pengguna                          | Area       | Keterangan                                                                                                                                                                      |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jastiper** (owner / admin brand) | `/` (shell member) | Mengelola event belanja, pesanan, tagihan, keuangan, dan ikut event kalender. Satu-satunya yang bisa daftar sendiri (self-service).                                       |
| **Admin ALAKA**                   | `/admin`   | Ditandai `users.is_admin` (default `false`, diaktifkan manual lewat DB). Memverifikasi langganan PRO jastiper & partner, melihat customer, mengelola event kalender dan akun partner (lihat 4.13–4.15, 4.18–4.20). |
| **Partner**                       | `/partner` | Brand/penyelenggara event yang memamerkan produknya di kalender. Akun dibuat admin ALAKA lewat undangan, tabel & sesi terpisah dari jastiper (lihat 4.21).                    |

Model bisnisnya langganan (lihat 5): setiap **brand** baru otomatis dapat **trial
30 hari** dengan semua fitur terbuka, lalu turun ke paket **FREE** (fitur
dasar tetap jalan, fitur PRO terkunci) dan bisa naik ke **PRO** lewat
pembayaran manual yang diverifikasi admin. Partner punya langganan PRO sendiri
(lihat 5.8).

Selain alur belanja, ada **Kalender Event** global (bazar/pameran/PO) yang diisi
admin ALAKA dan partner; jastiper bisa menekan **Ikut Event** untuk otomatis
membuat event belanja di akunnya (lihat 4.17).

## 2. Referensi

Riset awal dilakukan terhadap aplikasi sejenis "JasTip.Nya by Afathya"
(jastipnya-afathya.netlify.app) — versi desktop dengan sidebar navigation.
Konsep inti (Event → Order per customer → Item) diadaptasi dari sana, lalu
didesain ulang mobile-first dengan bottom tab navigation (terinspirasi dari
Astra Otoshop). Area admin dan Partner Portal responsif: bottom nav di mobile,
sidebar + tabel di desktop.

## 3. Tech Stack

| Layer               | Pilihan                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | TanStack Start (React 19 + Vite 8)                                                                                               |
| Routing             | TanStack Router                                                                                                                  |
| Data fetching/cache | TanStack Query                                                                                                                   |
| Styling             | Tailwind CSS v4 (mobile-first)                                                                                                   |
| PWA                 | vite-plugin-pwa + Workbox (custom service worker)                                                                                |
| Database            | PostgreSQL via Drizzle ORM — perubahan skema **wajib lewat migrasi** (`db:generate` + `db:migrate`), bukan `db:push` (lihat 7.1) |
| Auth                | Session-based, cookie httpOnly (30 hari); password di-hash (bcryptjs). Sesi jastiper/admin dan sesi partner di tabel & cookie terpisah |
| OAuth               | Google OAuth 2.0 (OpenID Connect — login/register via Google; tidak untuk akun partner)                                          |
| Email               | `src/lib/mailer.ts`, mode via `MAIL_MODE`: `console` (default, hanya di-log), `resend` (Resend HTTP API), atau `smtp` (`nodemailer`, dimuat dinamis). Dipakai verifikasi email, reset sandi, undangan tim, undangan partner |
| Penyimpanan file    | Netlify Blobs (`@netlify/blobs`) lewat `src/lib/storage.ts`: foto brand, banner event, bukti transfer, logo & foto produk partner (lihat 8.1). Deploy ke Netlify |
| QRIS                | `qrcode` (gambar QR dinamis di modal upgrade) dan `jsqr` (baca QR dari gambar yang diunggah admin) — lihat 4.14 & `lib/qris.ts` |
| Validasi            | Zod (client & server)                                                                                                            |
| Testing             | `node:test` (dijalankan via `tsx --test`, lihat `npm test`)                                                                      |
| Icons               | Lucide React                                                                                                                     |
| Baca file Excel     | `read-excel-file` (build `/browser`, di-`import()` dinamis waktu import data — lihat 4.3.2)                                      |
| Tulis file Excel    | `xlsx` (SheetJS — `utils.aoa_to_sheet` + `writeFile`, di-`import()` dinamis: unduh template import 4.3.2 & export pesanan 4.3.3) |
| Push notification   | Paket `web-push` sudah terpasang tetapi **belum dipakai** di kode mana pun (lihat 9). Service worker hanya melakukan precache aset statis |

## 4. Fitur & Halaman

### 4.1 Autentikasi

- **Register** (`/register`) — nama, nama brand jastip (opsional), email, password (min 8) + konfirmasi. Self-service: membuat **satu brand + satu akun owner** dalam satu transaksi, langsung login (sesi 30 hari). Email ditolak kalau sudah dipakai akun jastiper **atau** akun partner.
- **Verifikasi email** — saat register, link verifikasi dikirim (best-effort: kalau pengiriman gagal, register tetap sukses). Akun **langsung bisa dipakai**, tetapi sebelum email terverifikasi muncul banner kuning "Email kamu belum diverifikasi" + tombol **Kirim ulang email** (di Beranda dan Profil), dan beberapa aksi sensitif ditolak server lewat `requireVerifiedEmail()` (`lib/email-verified.ts`):
  - mengajukan upgrade PRO / kirim bukti transfer,
  - unggah foto brand (menghapus foto tidak dikunci),
  - tambah/ubah metode pembayaran bertipe **QRIS** (bank & e-wallet tidak dikunci),
  - mengundang admin brand,
  - ganti kata sandi.

  Fitur lain (event, pesanan, tagihan publik, Ikut Event) **tidak** menunggu verifikasi. Detail teknis: token di-hash SHA-256, berlaku **24 jam** (`TOKEN_TTL_HOURS`), maksimal **3 pengiriman per user per 15 menit**; halaman `/verifikasi-email/:token` memverifikasi lewat POST setelah halaman termuat (supaya pemindai link tidak menghanguskan token), dengan hasil `verified` / `already` / `expired` / `invalid`. Login Google yang email-nya diverifikasi Google, serta akun yang dibuat lewat undangan tim, otomatis terverifikasi.
- **Login** (`/login`) — email + password. Mencoba akun jastiper dulu, kalau email tidak ada baru akun **partner** (halaman yang sama). Pesan gagal selalu generik ("Email atau password salah"). Tujuan setelah login: partner → `/partner`, admin ALAKA → `/admin`, selain itu `/`. Checkbox "Ingat saya" ada di form tetapi **belum berpengaruh** — sesi selalu 30 hari (cookie `jastip_session`, httpOnly, SameSite=lax, Secure di produksi).
- **Google OAuth 2.0** (`/api/auth/google` + `/api/auth/google/callback`) — dibuka di popup. Tiga kasus di callback: `googleId` sudah dikenal → login; email sudah terdaftar → akun ditautkan ke Google (kalau akun itu belum terverifikasi, password-nya dihapus dan semua sesinya dicabut sebagai pencegahan pembajakan); selain itu → brand + owner baru tanpa password. Ditolak kalau `email_verified` false atau email milik akun partner. Param `?invite=<token>` dipakai untuk menerima undangan tim lewat Google (lihat 4.16).
- **Lupa Sandi** (`/lupa-sandi`) — user masukkan email, terima link reset via email. Berlaku **1 jam**, maksimal 3 permintaan per 15 menit.
- **Reset Sandi** (`/reset-sandi/:token`) — halaman ganti password via token sekali pakai (SHA-256 hash, ada `expires_at` + `used_at`). Permintaan link baru menghanguskan token lama. Akun partner punya alur & tabel sendiri (`/reset-sandi-partner/:token`, lihat 4.21).
- Route protection: layout `_app` melakukan `beforeLoad` cek session, redirect ke `/login` jika belum login; admin ALAKA yang membuka halaman member dipindah ke `/admin`. Bottom nav tab **tidak muncul** di halaman login/register.

### 4.2 Beranda

- **Header**: judul besar = **nama brand** (`brands.name`), fallback `ALAKA` kalau brand belum diberi nama. Di bawahnya sapaan **"Halo {nama user}"** — nama pribadi akun yang sedang login (fallback `'Jastiper'`), jadi owner dan admin brand sama-sama melihat nama brand yang sama tetapi sapaan sendiri-sendiri.
- Ringkasan keuangan singkat (2 kartu: **Uang masuk** = total `paidAmount` seluruh event; **Belum bayar** = sisa tagihan semua pesanan yang belum lunas). Kedua angka ini menghitung **semua** event termasuk yang nonaktif — event ditutup bukan berarti uangnya hilang dari catatan.
- List **Event aktif** milik brand (diurutkan terbaru dulu): card berisi nama, tanggal (format `d MMM`), jumlah pesanan. Event hasil **Ikut Event** dari kalender (4.17) ikut muncul di sini seperti event biasa.
- Event yang **nonaktif** (lihat 4.3) dikeluarkan dari daftar itu dan dipindah ke bagian **Event nonaktif (n)** yang terlipat di bawahnya (buka-tutup), tiap card diberi badge "Nonaktif" dan tampil lebih redup. Datanya tidak dihapus, cuma tidak mengganggu daftar event yang masih jalan.
- Tap card → masuk ke Detail Event.
- Link **Tambah event** di pojok kanan atas.
- Avatar brand di header (foto brand kalau sudah diunggah, selain itu inisial) → link ke halaman Profil.

### 4.3 Detail Event (`/events/:eventId`)

- **Header**: tombol back, nama event (+ badge **Nonaktif** kalau event sudah ditutup), menu tiga titik berisi: pilih **Aturan Fee** event (lihat 4.9), toggle **Sembunyikan rincian fee** (lihat di bawah), **Import data (Excel/CSV)** (lihat 4.3.2), **Export data (Excel)** (lihat 4.3.3), toggle **Event aktif**, dan **Hapus event** (dengan konfirmasi).
- **Sembunyikan rincian fee** (`events.hide_fee`, default mati; `setEventHideFee`): kalau aktif, invoice internal, halaman tagihan publik, dan variabel `{listItem}` di Template Chat WA tidak memecah "harga + fee" — daftar barang hanya menampilkan **qty + harga nett per unit** (harga asli + fee). Total tagihan **tidak berubah**, hanya cara menampilkannya. Berguna kalau jastiper tidak ingin pelanggan melihat besaran fee.
- **Nonaktifkan event** (toggle di menu tiga titik) = menutup event tanpa menghapus data: muncul banner "Event ini nonaktif", tombol **+ (Tambah Pesanan)** disembunyikan, dan `createOrder` di server ikut menolak. Pesanan lama tetap bisa dibuka, diedit, dihapus, dan ditagih seperti biasa. Bisa diaktifkan lagi kapan saja.
- **Hapus event**: konfirmasi menyebut jumlah pesanan yang ikut terhapus (FK `orders` → `events` dan `items` → `orders` pakai `ON DELETE CASCADE`), sekaligus menyarankan pakai **nonaktifkan** kalau cuma mau menutup event. Setelah terhapus, user dibalikkan ke Beranda.
- **Ringkasan keuangan event**: uang masuk, outstanding, estimasi untung bersih.
- **Dropdown pilih Aturan Fee** untuk event ini (lihat 4.9).
- **Search/filter pelanggan** (filter real-time berdasarkan nama customer).
- **View toggle**: mode "Per Pelanggan" (accordion customer) dan mode "Ringkasan Barang" (lihat 4.3.1).
- List pesanan dikelompokkan per customer (accordion), badge status **Belum Lunas / DP / Lunas / Dikirim**.
- Expand customer → list item + tombol aksi: **Tagih** (→ invoice internal; fitur PRO — di paket FREE tombolnya berubah jadi ikon gembok + badge PRO, dan klik-nya hanya memunculkan dialog upgrade, bukan halaman tagih. Lihat 5), **Tambah**, **Hapus**, **Edit status**. Daftar customer diurutkan **alfabetis** (tanpa membedakan huruf besar/kecil).
- Untuk event yang berasal dari kalender milik **partner**, ada tombol **Pakai paket** (lihat 4.4.1) dan blok etalase produk partner (lihat 4.17).
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
- **Download template**: di layar awal modal (sebelum file dipilih) ada tombol **Download template** yang mengunduh contoh file **`.xlsx`** (`template-import-pesanan.xlsx`) siap isi. Isinya datang dari `buildImportTemplateRows()` di `lib/order-import.ts` (murni — cuma data, tanpa library Excel), lalu dibentuk jadi sheet pakai SheetJS `xlsx`: `XLSX.utils.aoa_to_sheet()` → `XLSX.utils.book_new()` → `XLSX.utils.book_append_sheet()` → `XLSX.writeFile()` (SheetJS yang menyiapkan file & memicu unduhannya di browser). Library `xlsx` di-`import()` **dinamis di dalam handler** (lihat 8, "Konvensi penamaan") supaya tidak ikut bundle awal dan tidak pernah jalan saat SSR. Header template (`IMPORT_TEMPLATE_HEADER`): `No urut | Nama | No WA | item | harga | qty | fee`. Isinya **4 baris contoh untuk 2 pelanggan** (masing-masing 2 barang; pelanggan pertama sengaja muncul di dua baris supaya kelihatan bahwa baris dengan nama pelanggan sama digabung jadi satu tagihan) dan header-nya persis nama kolom yang dibaca. Kolom `No urut`, `harga`, `qty`, dan `fee` ditulis sebagai angka (bukan teks) supaya Excel memperlakukannya sebagai bilangan. Tombol yang sama juga muncul di layar "file belum bisa dipakai" dan "baris belum benar", biar user bisa langsung memakai format yang benar.
- **Kolom yang dibaca**: `No urut`, `Nama`, `No WA`, `item`, `harga`, `qty` (opsional), `fee` (opsional). Format lama dengan satu kolom `Nama-no wa` juga masih dibaca. **Urutan kolom bebas** dan kolom yang tidak dipakai (mis. `No urut`) boleh ada di mana saja — pencocokannya lewat **nama header**, bukan posisi (`classifyHeader`):
  - `qty`/`jumlah` → jumlah barang (opsional). Kosong dianggap **1**; kalau diisi harus bilangan bulat **1–1.000**, selain itu barisnya dihitung error (`parseImportQty`).
  - `fee` → fee jastip **per unit** (opsional); lihat aturan fee di bawah.
  - `harga`/`price` → harga asli barang. Nilai `15.000`, `15000`, `Rp 15.000`, dan angka asli dari Excel dua-duanya diterima.
  - `item`/`barang`/`produk` → nama barang.
  - `nama` + `wa`/`hp`/`telp`/`nomor` dalam satu header (mis. `Nama-no wa`) → nama pelanggan dan nomor WA dipisah dari satu sel (pemisah `-`, `|`, atau tanda kurung). Kalau header nama & nomor dipisah jadi dua kolom, itu juga dikenali. Header `Nama Barang` sengaja dibaca sebagai kolom **barang**, bukan nama pelanggan.
  - Baris header boleh tidak di baris pertama (mis. ada judul di atasnya) — header pertama yang memuat minimal kolom `item` + `harga` yang dipakai.
- **Satu pelanggan = satu tagihan**: baris-baris dengan nama pelanggan yang sama (dicocokkan tanpa membedakan huruf besar/kecil) dikumpulkan jadi satu pesanan. Baris dengan nama barang, harga, dan fee yang sama persis digabung jadi satu baris dengan qty dijumlahkan.
- **Fee jastip**: kolom `fee` di file **opsional**. Kalau **terisi**, nilainya dipakai apa adanya per barang (fee yang tidak bisa dibaca = baris error). Kalau **kosong**, fee dihitung dari **Aturan Fee event ini** pakai rumus yang sama dengan form Tambah Pesanan (harga asli dicocokkan ke tier, lihat _Logika auto-fill fee_ di §7). Kalau event belum punya Aturan Fee, atau harganya di luar semua tier, fee-nya **0** (bukan dikosongkan, karena di import tidak ada yang bisa mengisi manual). Fee berlaku per unit dan ikut dikalikan qty: total = `(harga asli + fee) × qty`.
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
- **Isinya disusun `buildOrderExportRows()` di `lib/order-export.ts`** (murni: cuma array-of-arrays, tanpa db/browser/library Excel), lalu file-nya dibikin SheetJS `xlsx` (`utils.aoa_to_sheet()` → `book_new()` → `book_append_sheet()` → `writeFile()`) dengan sheet bernama **`Pesanan`**. Library `xlsx` di-`import()` **dinamis di dalam handler** — pola yang sama dengan unduh template import (lihat 4.3.2 & 8, "Konvensi penamaan").
- **Urutan baris**: dikelompokkan per nama pelanggan (diurutkan tanpa membedakan huruf besar/kecil) supaya hasil export-nya stabil dan tidak ikut urutan yang dikirim database; urutan barang **di dalam** satu pesanan dibiarkan apa adanya.
- **Nama file**: `pesanan-<nama-event>.xlsx`, dengan nama event dibersihkan jadi huruf kecil & tanda hubung (`orderExportFileName()`); nama yang isinya cuma simbol/jarak jatuh ke `pesanan-event.xlsx`. Setelah file terunduh muncul alert melayang: "Export selesai: N baris barang dari M pesanan."
- Tidak ada gerbang paket di fitur ini: datanya sudah tersedia di halaman event, jadi export bisa dipakai semua user (server tidak dipanggil sama sekali).

### 4.4 Tambah / Edit Pesanan (Bottom Sheet)

- Context: event terkait (chip, non-editable).
- **Nama pelanggan** — autocomplete dari daftar Customer yang tersimpan. Label saran berbentuk **"Nama 4digitTerakhirHP"** (mis. "Budi 6608") bila customer punya nomor HP, supaya dua pelanggan sama-nama tetap terbedakan (`customerLabel`). Bisa diisi bebas jika belum terdaftar. Saran otomatis ini (`customer_suggestions`) terbuka untuk semua paket, termasuk FREE.
- **No. HP pelanggan** — opsional, dipakai untuk kirim WA dari halaman Invoice dan sebagai **kunci pencocokan ke data Customer** (alamat kirim, lihat 4.10).
- **Kartu barang berbentuk akordeon** — tiap barang titipan adalah kartu yang bisa dilipat (hanya satu terbuka sekali waktu): form **Tambah** mulai dengan barang pertama terbuka, form **Edit** mulai dengan semua kartu tertutup supaya daftar barang ringkas.
- Barang titipan — repeatable block: nama barang, harga asli, jumlah (qty), fee jastip.
  - **Fee auto-terisi** berdasarkan Aturan Fee event ini + harga barang yang diinput (lihat 4.9). Bila harga di luar semua tier, field fee dikosongkan untuk diisi manual.
  - **Fee jastip tidak wajib diisi.** Kalau field fee dibiarkan kosong, fee dianggap **0** — jadi barang titipan yang memang tanpa fee (mis. titipan tanpa upah) tetap bisa disimpan tanpa harus mengetik angka dulu. Nilai 0 ini berlaku seperti fee biasa di semua perhitungan (`(harga asli + 0) × qty`), dan field **Harga asli** tetap wajib.
  - **Fee berlaku per unit**: total satu barang = `(harga asli + fee) × qty`. Contoh: barang 30.000 + fee 4.000, qty 2 → (30.000 + 4.000) × 2 = 68.000.
  - **Saran nama barang & harga asli** — saat mengisi nama barang, muncul saran dari barang yang pernah dicatat di event ini (nama + daftar harga), diambil dari server (`getOrderSuggestions`). Ini fitur dasar yang terbuka untuk semua paket, termasuk FREE.
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

#### 4.4.1 Paket Partner ("Pakai paket") & Barang Terkunci

Khusus event yang berasal dari **event kalender milik partner** (lihat 4.17 & 4.21): jastiper bisa memasukkan **paket** yang aturannya dibuat partner (mis. "3 pcs Rp100.000") langsung ke pesanan.

- **Tombol "Pakai paket"** di Detail Event / form pesanan membuka `PartnerBundleSheet`: pilih aturan paket → isi komponen (varian + qty per komponen) → harga jual ke pelanggan, fee, dan jumlah paket. Aturan & produk yang bisa dipilih datang dari `getEventPartnerCatalog`: hanya aturan **aktif** yang punya produk di antara produk yang dipilih partner untuk event itu, dan **hanya kalau partner-nya PRO** (lihat 5.8). Kalau PRO partner habis, paket baru tidak ditawarkan lagi.
- **Aturan paket = "N pcs untuk Rp X"** (mix-and-match): jumlah qty semua komponen harus **tepat** `min_qty` aturan. Harga paket dari partner adalah **HPP** (modal jastiper), bukan harga ke pelanggan; harga jual default = harga paket dan boleh diubah jastiper.
- **Disimpan sebagai satu baris `items`** (`is_bundle = true`, `partner_rule_id`, `hpp` snapshot, nama "A + B + C") plus baris `item_components` (nama produk, ukuran, variasi, qty — snapshot). Semua HPP & komponen **dibaca ulang dari DB** oleh server (`buildPartnerBundle`), tidak pernah dipercaya dari client. Server menolak kalau: event bukan milik brand, event nonaktif, event tidak terhubung ke event kalender, aturan nonaktif, partner tidak PRO, atau varian tidak aktif / tidak dijual di event itu. Penambahan paket ikut aturan **gabung pesanan** (4.4): pelanggan yang sudah punya pesanan belum lunas/DP digabungkan.
- **Barang terkunci**: baris dengan `partner_rule_id` terisi tidak bisa diubah isi/qty-nya lewat form edit biasa dan tidak ikut digabung atau dihapus oleh `updateOrder` (`partner-bundle-lock.ts`: `isLockedBundle`, `partitionLockedItems`). Yang masih boleh diubah hanya **harga jual dan fee** lewat aksi khusus (`updatePartnerBundlePricing`). Form edit menampilkan total & fee paket terkunci ("Termasuk N baris paket partner…").
- **Total** memakai rumus yang sama dengan barang biasa: `(harga jual + fee) × qty`. HPP tidak pernah memengaruhi tagihan pelanggan; saat ini HPP hanya **disimpan sebagai snapshot** (`items.hpp`) — belum dipakai di dashboard Keuangan (4.7) maupun rekap partner (4.21.6). Helper `lineProfit` di `lib/partner-pricing.ts` sudah ada (`(harga jual − HPP + fee) × qty`) tetapi belum dipanggil dari UI.
- Barang satuan dari produk partner juga menyimpan `partner_variant_id` dan `hpp` (harga varian) sebagai snapshot.

### 4.5 Invoice (Internal) — `/invoice/:eventId/:orderId`

- Halaman untuk jastiper — dilindungi auth.
- Termasuk fitur PRO `billing`. Datanya diambil lewat server function yang dijaga (`getOrderInvoice`), jadi user FREE ditolak walau URL-nya diketik langsung (lihat 5).
- Card invoice: nama brand/jastiper, no. invoice (8 karakter UUID), nama pelanggan, nama event, tanggal invoice, daftar item (qty × harga + fee — atau qty × harga nett kalau event memakai **Sembunyikan rincian fee**, lihat 4.3), total tagihan. **Nama barang dibiarkan membungkus (wrap), tidak dipotong dengan elipsis** — supaya nama paket bundling panjang (mis. "Kaos + Celana + Topi") tetap terbaca utuh.
- **Alamat kirim pelanggan**: diambil dari data Customer yang **nomor HP-nya** cocok dengan nomor HP pesanan ini (aturan pencocokannya di `customer-matching.ts`, lihat 4.10; nama tidak dipakai). Kalau pesanan tidak punya nomor HP, atau alamatnya belum diisi, muncul pengingat singkat untuk melengkapinya lewat Profil → Customer — biar jastiper tahu kenapa alamatnya tidak muncul di link tagihan.
- Info metode pembayaran aktif milik jastiper (bank, e-wallet, QRIS).
- Status pembayaran dengan badge warna.
- **Kirim ke WhatsApp**: input No. HP pelanggan (validasi format nomor Indonesia), tombol generate link `wa.me` dengan pesan dari **Template Chat WA** (lihat 4.8.4). Tombol ini cuma ada di halaman invoice, jadi otomatis ikut terkunci untuk paket FREE.
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

- 3 kartu: **Total pemasukan** (`SUM(paidAmount)` seluruh event milik brand), **Total modal keluar** (`SUM(originalPrice × qty)` pesanan lunas/dikirim), **Untung bersih** (`SUM(fee × qty)` pesanan lunas/dikirim). Semua query difilter `events.brand_id`, jadi owner dan admin brand melihat angka yang sama.
- **Grafik pendapatan bulanan** (bar chart custom — hanya pesanan dengan status paid/shipped). Tap bar → tooltip nominal bulan tersebut.
- **Rincian per event**: card per event — nama event, tanggal, uang masuk, uang keluar, untung (warna aksen).

### 4.8 Profil — `/profil`

- Header: avatar (foto brand kalau ada, selain itu inisial), nama user, dan tombol **Edit profil** → modal `EditProfileModal` dengan field **nama** (semua anggota), serta **nama brand** dan **nomor WhatsApp brand** (**hanya owner**; server menolak admin brand lewat `requireBrandPermission('brand.profile')`). Nomor WA divalidasi format Indonesia dan disimpan dalam bentuk lokal `08…`; kosong = dihapus. Nomor WA brand **wajib terisi** sebelum brand bisa Ikut Event (lihat 4.17).
- **Foto brand** — diunggah dari halaman Profil oleh **owner** dengan email terverifikasi. Gambar diproses di client (`lib/avatar-image.ts`): sumber maks 15 MB, di-crop persegi tengah, diperkecil ke **256×256** di atas latar putih, di-encode WebP (fallback JPEG, kualitas turun bertahap 0,85 → 0,7 → 0,55) sampai ≤ **100 KB**. Server memvalidasi ulang (hanya `image/webp`/`image/jpeg`, ≤ 100 KB, magic bytes cocok) lalu menyimpannya di Netlify Blobs dengan key = `brand.id`; `brands.avatar_updated_at` menandai ada-tidaknya foto sekaligus jadi cache-buster `?v=`. Disajikan lewat `GET /api/avatar/:brandId`. Foto milik **brand**, bukan per akun.
- Banner **VerifyEmailBanner** muncul di bawah header selama email belum terverifikasi (lihat 4.1).
- Isi halaman dikelompokkan jadi empat bagian (di bawah). Menu yang hanya relevan untuk owner **disembunyikan** untuk admin brand (lihat 4.16 untuk matriks izin).
- **Badge "New"** (`NewBadge`, `lib/new-feature.ts` → `NEW_FEATURES`) bisa dipasang di baris menu yang baru dirilis. Saat ini menyala untuk **Kelola Tim**; badge tidak hilang saat diklik — dicabut dengan mengubah entri `NEW_FEATURES`.

#### 4.8.1 Akun & Keamanan

- **Subscription** (ikon Crown; **owner saja**) — badge status paket (`planBadgeText`): `Trial · N hari lagi`, `PRO · sisa N hari`, `PRO`, atau `FREE`. Tap baris → halaman **Paket & Langganan** (lihat 4.12).
- **Keamanan** — membuka modal **Ubah Kata Sandi** (`ChangePasswordModal`) kalau akun punya password. Perlu email terverifikasi, kata sandi lama benar, baru min 8 karakter; setelah berhasil **semua sesi lain dicabut** dan sesi baru dibuat. Akun Google-only menampilkan info statis bahwa kata sandi diatur dari akun Google.

#### 4.8.2 Bisnis & Tim

- **Manajemen Fee** → `/profil/fee-rules` (semua anggota).
- **Data Customer** → `/profil/customers` (semua anggota).
- **Kelola Tim** → `/profil/tim` (owner saja, lihat 4.16).
- **Metode Pembayaran** → `/profil/pembayaran` (owner saja, lihat 4.8.3).
- **Master Control** dan **Activity Logs** — kodenya ada tetapi menunya **disembunyikan** (`FEATURES.advancedMenu = false` di `profil/index.tsx`); keduanya cuma link placeholder. Lihat 9.

#### 4.8.3 Metode Pembayaran — `/profil/pembayaran`

Dulu section di halaman profil; sekarang **halaman sendiri**, hanya untuk **owner** (`requireBrandPermission('paymentMethod.manage')`).

- List metode pembayaran aktif/nonaktif: bank, e-wallet, QRIS. Toggle aktif/nonaktif per metode.
- Tambah / edit / hapus metode pembayaran (modal `PaymentMethodModal`).
- Semua aksi **tulis** (tambah / edit / hapus / aktif-nonaktif) termasuk fitur PRO `payment_methods`: di paket FREE tombol "Tambah metode pembayaran" tampil terkunci + badge PRO, dan servernya menolak (`requireUserFeature('payment_methods')`). Daftar metodenya sendiri tetap bisa dibaca karena dipakai halaman tagihan pelanggan (lihat 5).
- Tipe yang didukung: `bank` (provider + no. rekening + nama pemilik), `wallet` (provider + no. HP), `qris` (upload gambar QRIS — disimpan sebagai base64 data URL di kolom `payment_methods.qris_image`). Menambah/mengubah metode **QRIS** juga butuh email terverifikasi; bank & e-wallet tidak.
- Metode aktif tampil di invoice/tagihan pelanggan.

#### 4.8.4 Preferensi Sistem

- **Mode Tampilan (gelap)** — toggle, disimpan di `localStorage` + `data-theme` attribute. **Default terang**: kalau user belum pernah memilih (belum ada nilai `localStorage.theme`), app dibuka terang walaupun HP-nya mode gelap — auto gelap (ikut `prefers-color-scheme`) tidak dipakai sebagai default. Script inline `buildThemeInitScript` (`src/lib/theme.ts`, dipasang `__root.tsx`) yang menentukan tema sebelum hydrate, dan `ThemeToggle.tsx` memakai konstanta `DEFAULT_THEME_MODE` yang sama.
- **Template Chat WA** (halaman `/profil/template-chat`, form `MessageTemplateForm`; owner **dan** admin brand boleh mengubah) — template pesan WhatsApp untuk tagih pelanggan, disimpan di `brands.wa_message_template`. Variabel yang ditampilkan sebagai chips: `{customer}`, `{event}`, `{link}`, `{tagihan}` (blok ringkasan tagihan otomatis — total, DP, tagihan akhir — menyesuaikan status DP), `{listItem}` (daftar barang satu baris per barang: `• nama (harga + fee)`; kalau event memakai **Sembunyikan rincian fee** hanya harga nett), `{bank}`, `{bankAccount}`, `{bankLine}` (baris "Transfer ke …", hilang kalau bank belum diatur), `{brand}`. Variabel lama `{subtotal}`, `{fee}`, `{total}`, `{dp}`, `{sisa}` masih dirender demi template kustom yang sudah ada, tetapi tidak lagi jadi chips. Bisa dikembalikan ke default. Dulu form ini modal; dipindah jadi halaman sendiri (header + tombol back, bottom nav tetap tampil seperti `/profil/langganan`) karena di sebagian HP tinggi kontennya — textarea + chips variabel + preview — bikin tombol Simpan ketutup.
- Item **Notifikasi** dan **Tambahkan ke layar utama** (prompt install PWA) sudah **dihapus** dari section ini: yang pertama cuma placeholder tanpa isi, yang kedua dianggap tidak perlu karena install tetap bisa dari menu browser (Chrome: ikon Install di address bar; iPhone: Share → "Tambahkan ke layar utama").

#### 4.8.5 Tombol Keluar

- Tombol **Keluar** (logout) — satu-satunya isi bagian bawah halaman profil.
- Item **Bantuan** dan **Tentang aplikasi** (versi `v1.0.0`) sudah **dihapus** dari halaman profil beserta judul section "Lainnya": dua-duanya cuma placeholder tanpa isi, jadi cuma menambah tinggi halaman.

### 4.9 Manajemen Fee — `/profil/fee-rules`

- List aturan fee: card per aturan — nama, jumlah tier, rentang harga, preview tier. Tombol "Tambah aturan fee".
- **Tambah / Edit Aturan Fee** — nama aturan + list tier (bisa tambah/hapus baris). Tiap tier: harga min, harga maks, fee jastip.
- **Saran tier otomatis** (dipakai di form Tambah **dan** Edit aturan fee) — dari harga dan fee barang yang pernah dicatat user, sistem mengelompokkan harga ke rentang (band) lalu menyarankan satu tier per rentang dengan fee = nilai tengah rentang tersebut (dibulatkan). Ini fitur dasar yang terbuka untuk semua paket, termasuk FREE (diambil dari `getFeeSuggestions`).

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

- Daftar customer milik **brand** (soft delete via `deleted_at`), diurutkan alfabetis. Owner dan admin brand sama-sama bisa mengelolanya.
- Data: nama, nomor HP (opsional), alamat (opsional).
- Alamat ikut tersimpan di form Tambah/Edit Customer dan ditampilkan di kartu customer; pencarian di halaman ini (di sisi client, tanpa pagination) mencakup nama, no. HP (digit saja), dan alamat.
- Alamatnya dipakai sebagai **alamat kirim** pelanggan di halaman Invoice internal (4.5) dan link Tagihan publik (4.6). Karena order cuma menyimpan nama & no. HP pelanggan (tidak ada relasi ke tabel `customers`), pencocokannya dilakukan lewat **nomor HP**: `phoneMatchKey()` menormalkan semua bentuk ("0812-3456-6608", "+62 812 3456 6608", "81234566608") ke bentuk lokal `081234566608` (minimal 8 digit). **Nama sengaja tidak dipakai** — nama di pesanan bisa beda dengan nama di Customer (typo, singkatan, atau label "Nama 6608" dari saran), sedangkan nomor yang sama berarti orang yang sama. Pesanan tanpa nomor HP → tidak ada yang cocok; customer tanpa nomor tidak pernah cocok; kalau ada beberapa customer dengan nomor sama, yang pertama dipakai (`customer-matching.ts`).
- Autocomplete customer dipakai di form Tambah Pesanan, dengan label "Nama 4digitTerakhirHP" (lihat 4.4).
- Tambah customer bisa dilakukan dari halaman Customer atau dari halaman Invoice saat nomor HP belum terdaftar.

### 4.11 Tambah Pesanan Cepat — `/pesanan/new`

- Tidak ada lagi tab/halaman **Pesanan** global (`/pesanan` tidak ada). Slot tab itu sekarang dipakai tab **Event** (kalender, 4.17).
- FAB tengah di bottom nav (tab "Tambah") mengarah ke `/pesanan/new`: halaman **pemilih event** ("Pilih event untuk pesanan ini") yang menampilkan daftar **event aktif**; tap event → `/events/:eventId?addOrder=true` yang langsung membuka sheet Tambah Pesanan (4.4).
- Event yang nonaktif tidak ditampilkan (tidak bisa ditambah pesanan baru; server juga menolak `createOrder`). Kalau semua event nonaktif atau belum ada event, halaman menampilkan petunjuk yang sesuai.

### 4.12 Paket & Langganan — `/profil/langganan`

- Halaman status langganan, dibuka dari baris **Subscription** di Profil (**owner saja** — langganan milik brand, dan semua aksinya dijaga `requireBrandPermission('subscription.manage')`). Punya header sendiri dengan tombol back (bottom nav tetap tampil di sini) dan dua tab: **Paket** dan **Riwayat**.
- **Kartu paket**: ikon Crown + teks "Paket Trial / FREE / PRO" + kalimat periode — "Sisa 12 hari (sampai 12 Februari 2026)" untuk trial, "Aktif sampai …" untuk PRO, "Masa trial berakhir …" untuk FREE — dilengkapi keterangan singkat masing-masing plan (`PLAN_INFO`).
- **Perbandingan paket** (teks marketing di `profil/langganan.tsx`: `FREE_FEATURES` & `PRO_FEATURES_LIST`): FREE = "Event dan pesanan tanpa batas", "Laporan keuangan dasar"; PRO = "Link tagihan publik untuk pelanggan", "Autocomplete nama dan no. HP customer", "Upload foto brand dan catatan", "Tambah admin tim". **Catatan:** daftar ini murni teks tampilan dan **tidak sama** dengan fitur yang benar-benar digerbang server (`PRO_FEATURES`, lihat 5.2: hanya `billing` dan `payment_methods`). Autocomplete customer, unggah foto brand, dan undang admin tim saat ini tidak dikunci paket (foto & undangan hanya butuh owner + email terverifikasi) — pilih salah satu: samakan teksnya dengan kode, atau pasang gerbangnya.
- **Daftar fitur PRO terkunci** (dirakit dari `PRO_FEATURES` — sekarang **2 fitur**: Tagih dan Metode Pembayaran) dengan status **Terbuka / Terkunci** per fitur (ikon centang vs gembok) + deskripsi singkat tiap fitur (`PRO_FEATURE_INFO`).
- **Harga**: nominal harga membership dari pengaturan admin. Kalau admin mengisi **harga coret** (`subscription_settings.original_price`), member melihat harga awal dicoret + badge **"Hemat N%"** (`discountPercent` di `lib/price-discount.ts`; hanya tampil untuk non-PRO). Murni tampilan: nominal yang ditransfer tetap `pro_price`.
- **Pengajuan upgrade** (muncul kalau belum PRO; butuh **email terverifikasi**): modal `SubmitSubscriptionModal` menampilkan nominal + **QRIS**. Kalau admin menyimpan payload QRIS statis (`qris_string`) dan harga > 0, modal membuat **QRIS dinamis** dengan nominal harga PRO di client (`toDynamicQris` di `lib/qris.ts` → `buildDynamicQrisPayload` di `lib/qris-display.ts` → gambar QR lewat `qrcode`), jadi member tinggal scan tanpa mengetik nominal. Kalau payload tidak ada/tidak valid, jatuh ke **gambar QRIS statis** (`qris_image`). Member scan & bayar → upload bukti transfer (PNG/JPEG/WEBP, maks 1MB, dikirim sebagai data URL). Gambar yang lebih dari 1MB diperkecil otomatis di client (sisi terpanjang maks 1000px, JPEG) lewat `fileToPaymentProofBlob`; yang sudah kecil dikirim apa adanya. Server **memvalidasi ulang** tipe, ukuran, dan magic bytes (`lib/payment-proof.ts`) lalu menyimpan file ke **Netlify Blobs** (store `payment-proofs`, key = id pengajuan; `subscriptions.payment_proof_stored = true`). Bukti lama yang berupa base64 di `payment_proof_image` tetap terbaca. File disajikan lewat `/api/subscription-proof/:id` dengan cek akses (`subscription-proof-access.ts`).
- Selama pengajuan belum diproses, halaman menampilkan kartu **"Menunggu verifikasi"** (nominal, tanggal pengajuan, tautan bukti transfer) dan form pengajuan tidak bisa dibuka lagi — server menolak pengajuan kedua karena maksimal **satu baris `pending` per brand** (dan per user).
- **Riwayat langganan** (tab Riwayat): baris yang sudah diproses (`active` / `rejected`) ditampilkan lengkap dengan periode, nominal, dan catatan review admin.
- Yang ditagih adalah **snapshot harga saat pengajuan dikirim** (`subscriptions.amount`) — kalau admin mengubah harga setelahnya, pengajuan yang sudah masuk tetap memakai harga lama (lihat 5.7).
- Halaman ini **hanya menampilkan** hasil entitlement dari server (`fetchCurrentUser` + `fetchMySubscriptionState`) — tidak ada perhitungan plan di client.

### 4.13 Dashboard Admin — `/admin`

Halaman terpisah untuk **admin ALAKA**, di luar `app-shell` member (`src/routes/admin.tsx`
punya layout sendiri: tanpa bottom nav member, header sendiri yang cuma berisi
identitas "Admin ALAKA"). Di **mobile** navigasi antar halaman admin berupa **bottom
tab** (`AdminBottomNav`), di **desktop (lg ke atas)** berupa **sidebar** (`AdminSidebar`) + `AdminTopbar`;
keduanya dibaca dari satu daftar `ADMIN_TABS` (`components/admin-nav-items.ts`, 6 tab — lihat di bawah). Dashboard-nya fokus ke **ringkasan user**
dan **verifikasi pengajuan**; daftar customer ada di halaman sendiri (4.15), pengaturan pembayaran PRO dan
tombol **Keluar** ada di 4.14, sedangkan event kalender, akun partner, dan langganan partner
punya halaman admin tersendiri (4.18–4.20).
User biasa yang membuka `/admin` di-redirect ke `/`; sebaliknya user admin yang
membuka halaman member (`_app`) langsung dipindahkan ke `/admin`, dan login / callback
Google admin juga mendarat di `/admin`.

Proteksi berlapis: `beforeLoad` di route cuma UX (redirect), sedangkan pagar yang
mengikat ada di server — **setiap** server function admin memanggil
`requireAdminUser()` (`src/lib/admin.ts`) di baris pertama handler-nya dan melempar
`AdminRequiredError` (`code = 'ADMIN_REQUIRED'`) kalau bukan admin.

**Kartu metrik** (`getAdminMetrics`) — **5 kartu**: di mobile selalu **2 kartu per baris**, di desktop 5 sebaris (`grid grid-cols-2 lg:grid-cols-5`). Grid mobile sengaja memakai `grid-cols-2` polos, **bukan**
`sm:grid-cols-2`: `sm:` itu breakpoint **viewport**, bukan lebar container. Karena
shell mobile dibatasi 480px, viewport ponsel selalu di bawah 640px, sehingga `sm:grid-cols-2` tidak pernah
aktif dan kartunya jatuh menumpuk satu per baris walau 480px cukup untuk dua kartu.

Layout admin mobile memakai kelas `app-shell app-shell--with-nav`: lebar tetap dihitung
`.app-shell` di `src/styles.css` (maks 480px, sama seperti shell member), sedangkan
`--with-nav` menyediakan `padding-bottom: calc(6rem + env(safe-area-inset-bottom))`
supaya isi paling bawah (mis. tombol **Keluar** di Pengaturan) tidak tertutup nav
yang `fixed` di mobile. Di desktop konten melebar (`pm-wide`) dan halaman daftar berganti dari kartu ke **tabel**.

**Navigasi admin** — daftar `ADMIN_TABS` di `components/admin-nav-items.ts`, dipakai bersama oleh `AdminBottomNav` (mobile; bentuknya
meniru `BottomNav.tsx` member: fixed, aman dari safe-area) dan `AdminSidebar` (desktop):

| Tab         | Route                      | Isi                                                  |
| ----------- | -------------------------- | ---------------------------------------------------- |
| Dashboard   | `/admin`                   | Ringkasan metrik + verifikasi langganan PRO jastiper |
| Customer    | `/admin/customers`         | Daftar semua customer/brand (4.15)                   |
| Event       | `/admin/event`             | Event kalender (4.18)                                |
| Partner     | `/admin/partner`           | Akun partner (4.19)                                  |
| PRO Partner | `/admin/langganan-partner` | Verifikasi langganan PRO partner (4.20)              |
| Pengaturan  | `/admin/pengaturan`        | Harga & QRIS PRO + tombol Keluar (4.14)              |

Halaman aktif ditentukan dari `pathname` yang trailing slash-nya dirapikan (`isAdminTabActive`), bukan
lewat `activeProps`: kecocokan route bawaan TanStack Router itu berawalan (prefix),
jadi hanya `/admin` yang dicocokkan **persis**, sedangkan tab lain juga menyala di sub-route-nya
(mis. `/admin/event/new`). Cara yang sama juga memperlakukan `/admin` dan `/admin/` sebagai satu halaman
(router memang me-redirect `/admin/` → `/admin`).

| Kartu        | Isi                                                                                                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Users  | Jumlah **brand** terdaftar, diwakili akun **owner** non-admin (admin brand tidak dihitung sendiri supaya satu brand tidak terhitung dua kali)                                                                                                                                                                                    |
| Active Users | Brand yang membuat/mengubah pesanan dalam **7 hari** terakhir (`count(distinct events.brand_id)` dari `orders.updated_at`; jendelanya konstanta `ACTIVE_USER_WINDOW_DAYS` dan nilainya ikut dikirim ke client sebagai `activeWindowDays` supaya hint kartu tidak bisa beda dari query-nya), bukan dari `activity_logs` yang belum diisi kode mana pun |
| PRO Active   | Baris `subscriptions` berstatus `active` **dan** `ends_at`-nya belum lewat                                                                                                                                                                                                                                                       |
| User Trial   | Brand yang `trial_ends_at`-nya belum lewat **dan** belum punya langganan PRO aktif ("Masa trial masih berjalan")                                                                                                                                                                                                                 |
| PRO Revenue  | `SUM(amount)` dari semua pengajuan yang **pernah disetujui** (`active` + `expired`), diformat Rupiah                                                                                                                                                                                                                             |

Jumlah pengajuan `pending` tidak lagi jadi kartu sendiri (query-nya tetap mengembalikan `proPending`); pengajuan menggantung ditangani lewat tab **Pending** di daftar verifikasi di bawah.

Dashboard tidak punya pintasan khusus ke daftar customer: navigasi admin selalu terlihat, jadi angka "Total Users" bisa ditelusuri lewat tab Customer (4.15).

**Verifikasi langganan PRO**:

- Daftar pengajuan **lintas semua brand**, terbaru dulu, difilter dengan tab **Pending / PRO Aktif / Semua** (filter di client). Kalau ada pengajuan menggantung sementara tab aktif bukan Pending, muncul tombol pintasan "Tinjau N pengajuan pending". Di mobile berupa kartu, di desktop berupa **tabel** (kolom Nominal, Durasi, Metode, Pengirim, Referensi, Diajukan, Aktif sampai, Diapprove, Bukti).
- Tiap pengajuan menampilkan identitas pengaju (nama + brand + email), nominal, tanggal bayar, tautan bukti transfer, badge status, dan tombol **Setujui / Tolak**.
- **Setujui** (`approveSubscription`): baris `pending` jadi `active` dengan jendela masa aktif dihitung `nextProWindow()` — perpanjangan menyambung dari `ends_at` yang masih berlaku, bukan dari hari ini — plus `reviewed_by`, `reviewed_at`, dan catatan review.
- **Tolak** (`rejectSubscription`): status jadi `rejected` + catatan review.
- Pengajuan yang sudah pernah diproses tidak bisa diproses ulang (server menolak dengan "Pengajuan ini sudah diproses sebelumnya"). Catatan review diisi lewat `ReviewSubscriptionModal` (mode approve / reject).

### 4.14 Pengaturan Admin — `/admin/pengaturan`

Halaman terpisah di dalam layout admin yang sama (`src/routes/admin/pengaturan.tsx`),
dibuka lewat **tab Pengaturan** di navigasi admin. Isinya semua yang bukan
aktivitas harian admin:

- **Pengaturan Pembayaran PRO** (kartu utama, pindahan dari dashboard):
  - **QRIS Pembayaran** — upload / ganti gambar **QRIS statis** yang dipakai member saat mengajukan upgrade (`UpdateQrisModal`), maks 1MB (PNG/JPEG/WEBP, tidak dikompres supaya QR tetap terbaca). Saat dipilih, gambar **dibaca di browser** dengan `jsqr` dan payload EMVCo-nya divalidasi (`isValidQris` + `isStaticQris` di `lib/qris.ts`); file yang bukan QRIS statis valid ditolak ("Bukan QRIS statis yang valid"). Yang disimpan ke server (`updateSubscriptionQris`) adalah **gambar** (`qris_image`) **dan payload mentah** (`qris_string`, maks 1000 karakter, divalidasi ulang di server) — payload inilah yang dipakai member untuk membuat QRIS dinamis bernominal (lihat 4.12). Kalau belum ada QRIS, kartunya memberi tahu bahwa member belum bisa mengajukan upgrade.
  - **Harga Membership** — nominal yang wajib ditransfer member (`pro_price`), plus **harga awal opsional** (`original_price`, dicoret di sisi member; kartunya menampilkan "Diskon otomatis: N%"). Diubah lewat `updateSubscriptionPrice({proPrice, originalPrice})`; datanya di-load via `subscriptionSettingsQuery` (query key `admin-subscription-settings`) di loader route ini. Perubahan harga **hanya berlaku untuk pengajuan baru** (lihat 5.7).
- **Tombol Keluar** di bawah kartu — dulu ada di header layout admin, sekarang tinggal di sini (`logoutUser()` → redirect `/login`).

Karena halaman ini yang membaca `fetchSubscriptionSettingsAdmin()`, dashboard tidak
lagi menyentuh pengaturan pembayaran sama sekali — loader `/admin` cuma butuh metrik
dan daftar pengajuan.

### 4.15 Daftar Customer (Admin) — `/admin/customers`

Daftar **semua brand** yang terdaftar di aplikasi (satu baris = satu brand, diwakili akun owner-nya; `src/routes/admin/customers.tsx`),
dibuka lewat **tab Customer** di navigasi admin (4.13). Fokusnya: siapa orangnya,
status langganannya, apakah masih aktif (ada aktivitas pesanan), dan berapa total uang yang sudah
masuk dari dia. Di mobile berupa kartu, di desktop berupa tabel (`pm-wide`).

Data datang dari satu server function `fetchAdminUsers` → `listAdminUsers()`
(`src/lib/admin-queries.ts`, query key `admin-users`, di-`ensureQueryData` di loader
route). Isi tiap baris:

| Kolom             | Sumber                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Nama / email      | `users.name`, `users.email` akun owner, plus `brands.name` sebagai judul kartu; jumlah admin brand (`adminCount`)          |
| Plan + PRO sampai | `resolveEntitlement()` — aturan trial/FREE/PRO **tidak** ditulis ulang di query (lihat 5.1)                                |
| Pending           | Ada `subscriptions` berstatus `pending` (badge kuning)                                                                     |
| Status aktif      | Ada pesanan dibuat/diubah dalam **7 hari** terakhir (`ACTIVE_USER_WINDOW_DAYS`), sama definisinya dengan kartu "Active Users" di 4.13 |
| Aktivitas terakhir | `max(orders.updated_at)` per brand (lewat `events.brand_id`) — pesanan terakhir dibuat/diubah                              |
| Total revenue     | `SUM(amount)` dari langganan yang pernah disetujui (`active` + `expired`) — definisi yang sama dengan metrik "PRO Revenue" |
| Terdaftar         | `users.created_at`                                                                                                         |
| Plan + PRO sampai | `resolveEntitlement()` — aturan trial/FREE/PRO **tidak** ditulis ulang di query (lihat 5.1)                                |
| Pending           | Ada `subscriptions` berstatus `pending` (badge kuning)                                                                     |
| Status aktif      | Ada pesanan dibuat/diubah dalam **7 hari** terakhir (`ACTIVE_USER_WINDOW_DAYS`), sama definisinya dengan kartu "Active Users" di 4.13 |
| Aktivitas terakhir | `max(orders.updated_at)` per brand (lewat `events.brand_id`) — pesanan terakhir dibuat/diubah                              |
| Total revenue     | `SUM(amount)` dari langganan yang pernah disetujui (`active` + `expired`) — definisi yang sama dengan metrik "PRO Revenue" |
| Terdaftar         | `users.created_at`                                                                                                         |

Detail teknis:

- **Digabung di memori, bukan lewat `join`.** Semua user diambil sekali, lalu jumlah
  langganan / revenue / aktivitas terakhir diambil sebagai query agregat terpisah
  (per user) dan dipetakan ke peta (`Map`) — join langsung ke `users` akan
  menggandakan baris user dan bikin `SUM`-nya salah. Alasan yang sama dipakai di
  metrik dashboard.
- **`last_activity_at` wajib lewat helper `max()` dari drizzle**, bukan `sql` mentah:
  driver `pg` di sini dikonfigurasi drizzle untuk mengembalikan kolom tanggal sebagai
  **string**, dan mapping tipe kolom itulah yang mengubahnya jadi `Date`. `sql\`max(...)\``mentah tidak dipetakan, sehingga`isActive` gagal (`getTime is not a function`).
- **Tab & urutan di client** (tanpa round-trip server; semua baris dimuat sekaligus, **tanpa pagination**): tab **Semua / PRO / Trial /
  Pending / FREE** dengan jumlah per tab, kotak cari nama/email, dan pengurutan yang bisa
  diganti bergilir lewat tombol: **Aktivitas terbaru** (default; akun aktif dulu, lalu yang
  `lastActivityAt`-nya paling baru, tie-break terdaftar terbaru) → **Terbaru** (`created_at` menurun) →
  **Revenue tertinggi**. Tab Pending sengaja terpisah dari tab plan karena pengajuan bisa nempel di plan apa pun.
- **Hapus brand permanen** (`deleteBrandAdmin` → `deleteBrandWithUsers`, satu transaksi): tombol "Hapus permanen" dengan konfirmasi "Hapus brand …?" menghapus **brand beserta semua akunnya** (owner + admin) dan seluruh data brand lewat cascade. Setelah sukses, file di Netlify Blobs ikut dibersihkan: foto brand (`deleteAvatar(brandId)`) dan bukti transfer tiap langganan (`deletePaymentProof`). Tidak bisa dibatalkan.
- Selain tombol hapus, halaman ini **read-only**: tindakan setujui/tolak tetap di dashboard 4.13.

### 4.16 Tim & Peran Brand — `/profil/tim`

Satu brand bisa dikelola lebih dari satu orang. Peran (`users.brand_role`):

- **owner** — pemilik brand; tepat **satu per brand** (dijaga unique index `users_one_owner_per_brand`). Akun yang mendaftar sendiri otomatis owner.
- **admin** — anggota tim yang hanya mengurus operasional harian. Hanya bisa dibuat lewat **undangan** owner.

**Matriks izin** (`lib/brand-permissions.ts`, `can()` / `requireBrandPermission()` — dipanggil di server function; pelanggaran melempar `BrandPermissionError`: "Aksi ini hanya bisa dilakukan oleh pemilik brand."):

| Aksi                                                          | Owner | Admin |
| ------------------------------------------------------------- | :---: | :---: |
| `operations` — event, pesanan, customer, aturan fee, keuangan, Ikut Event | ✅    | ✅    |
| `brand.messageTemplate` — Template Chat WA                    | ✅    | ✅    |
| `brand.profile` — nama brand, nomor WA brand, foto brand      | ✅    | ❌    |
| `paymentMethod.manage` — metode pembayaran (4.8.3)            | ✅    | ❌    |
| `subscription.manage` — ajukan PRO, bukti transfer, riwayat (4.12) | ✅ | ❌    |
| `team.manage` — undang / batalkan / hapus admin               | ✅    | ❌    |

Setiap anggota tetap bisa mengubah **nama** dan **kata sandi** akunnya sendiri. Menu Profil yang tidak boleh dipakai admin disembunyikan di UI (Subscription, Metode Pembayaran, Kelola Tim), tetapi pagar yang mengikat ada di server.

**Halaman Kelola Tim** (owner saja; fungsi di `lib/team-functions.ts`: `fetchTeam`, `inviteAdmin`, `cancelInvitation`, `removeTeamAdmin`; komponen `TeamSection`): daftar anggota berlabel "Pemilik" / "Admin" dan undangan yang masih menunggu.

- **Batas**: `MAX_ADMINS_PER_BRAND = 1` (dihitung admin aktif + undangan pending; aturan di kode `lib/team-rules.ts`, bukan di skema, supaya bisa dinaikkan atau dikaitkan paket lewat `getMaxAdmins()`), `INVITATION_TTL_DAYS = 7`, dan `MAX_INVITATIONS_PER_DAY = 5` per brand per 24 jam (semua status dihitung, termasuk yang dibatalkan — mencegah "batalkan lalu undang ulang" dipakai untuk spam).
- **Mengundang** (`createInvitation`): butuh **email owner terverifikasi**. Email dinormalisasi huruf kecil; baris brand dikunci dalam transaksi; undangan pending yang sudah lewat masa berlaku ditandai `expired` dulu. Ditolak dengan kode `EMAIL_TERDAFTAR` (email sudah punya akun — undangan hanya untuk email **tanpa akun**), `UNDANGAN_SUDAH_ADA`, `SLOT_PENUH`, atau `TERLALU_BANYAK_UNDANGAN`. Token 32 byte acak (base64url); **hanya hash SHA-256** yang disimpan (`brand_invitations.token_hash`). Email berisi link `/undangan/<token>`; kalau pengiriman gagal, undangan otomatis dibatalkan dan user diminta mencoba lagi.
- **Status undangan**: `pending`, `accepted`, `revoked`, `expired`. Hanya `pending` yang bisa dibatalkan.
- **Menerima** (`/undangan/:token`): halaman menampilkan nama brand + email yang diundang; penerima mengisi nama, email (harus sama dengan yang diundang — `EMAIL_TIDAK_COCOK`), kata sandi (min 8) + konfirmasi, atau memakai **Google** (`/api/auth/google?invite=<token>`; token disimpan di cookie httpOnly `team_invite_token` 10 menit, dan Google harus melaporkan `email_verified`). Akun dibuat berperan **admin** di brand pengundang, email **otomatis terverifikasi**, lalu langsung login. Email milik akun partner ditolak.
- **Menghapus admin** (`removeAdmin`): **menghapus akun user itu** (hard delete; sesinya ikut terhapus) dan emailnya bisa dipakai lagi. Data yang pernah dibuatnya tetap milik brand (kolom `user_id` "dibuat oleh" menjadi `null`).

### 4.17 Kalender Event (Jastiper) — tab **Event** · `/kalender`

Daftar **global** bazar/pameran/PO yang diinput admin ALAKA (4.18) dan partner (4.21). Terbuka untuk semua paket (tanpa gerbang PRO), tetapi wajib login. Datanya tidak per brand — semua brand melihat daftar yang sama.

- **Daftar** (`routes/_app/kalender/index.tsx`, header "Event — Bazar & event jastip yang akan datang"): bukan grid bulan, melainkan **daftar** event mendatang/berjalan dari `listUpcomingCalendarEvents` — event dengan `coalesce(end_date, event_date) >= hari ini` dan belum diakhiri (`ended_at IS NULL`), urut tanggal mulai lalu nama, maksimal 300. Pencarian & filter dilakukan di client.
- **Kartu event** (`EventListCard`): lencana tanggal (hari, bulan 3 huruf, nama hari), tag **"Sedang Berlangsung"** atau **"N hari lagi"**, lokasi, dan rentang tanggal (event sehari: "Rabu, 14 Oktober 2026"; multi-hari: "20 – 22 Nov 2026").
- **Pencarian & filter** (`EventFilterSheet`): kotak "Cari event…" (nama atau lokasi); filter **Waktu** — chip "7 hari" dan "30 hari" di halaman, plus "Hari ini" dan "Custom" (1–365 hari) di sheet; filter **Lokasi** — "Online" / "Offline". Tiap grup hanya satu chip aktif; tombol filter menampilkan jumlah filter aktif, dan saat ada filter muncul "N event ditemukan" + "Hapus semua". Event yang sedang berjalan tetap ikut hitungan "N hari" (`isCalendarEventWithinDays`).
- **Berjalan / selesai** (`lib/calendar.ts`): event berjalan sampai **23.59 WIB** di tanggal terakhirnya (`endDate ?? eventDate`). `isCalendarEventFinished` = sudah **diakhiri admin/partner** (`ended_at`) atau tanggal terakhirnya sudah lewat. Event yang diakhiri langsung hilang dari daftar walau tanggalnya belum lewat, tetapi link langsungnya masih terbuka dengan pemberitahuan "Event ini sudah berakhir." dan tidak bisa diikuti.
- **Detail** (`/kalender/:eventId`, nav bawah disembunyikan): banner 16:9 (atau gradien bila tak ada), judul, tanggal & lokasi, **"Tentang event"** (deskripsi dengan auto-link: `http(s)://` dan `www.` dikenali, baris berisi hanya URL jadi chip bergambar ikon situs; skema lain seperti `javascript:` tidak pernah dijadikan link; link dibuka `target=_blank rel="noopener noreferrer nofollow"`; tanpa `dangerouslySetInnerHTML` — `lib/linkify.ts`), **etalase partner** (`PartnerShowcase`, hanya untuk event buatan partner: nama partner, sampai 6 produk pilihan, dan tombol unduh katalog dari `catalog_url`), dan **"Brand yang dipamerkan"** (chip, atau "Daftar brand belum tersedia."). Bar bawah berisi **Ikut Event**, atau **Lihat Event Saya** bila brand sudah ikut (disembunyikan jika event berakhir dan belum diikuti).
- **Banner** disajikan lewat `GET /api/event-banner/:eventId` (tanpa login; `?v=` → cache 1 tahun immutable, tanpa `?v=` → 60 detik).

#### 4.17.1 Ikut Event

- **Tidak ada tabel peserta**: "ikut" = baris **`events`** milik brand dengan `calendar_event_id` terisi. Unique index `events_brand_calendar_event_unique (brand_id, calendar_event_id)` menjamin satu brand hanya sekali per event kalender (klik ganda / dua perangkat aman). Tidak ada status partisipasi dan tidak ada "batal ikut" (event belanja yang terbentuk bisa dinonaktifkan/dihapus seperti event biasa).
- **Siapa yang boleh**: owner **dan** admin brand (`operations`). Email **tidak** harus terverifikasi, tidak ada gerbang PRO.
- **Syarat**: nomor **WhatsApp brand** (`brands.wa_number`) harus terisi — kalau kosong, sheet menampilkan peringatan merah ("Isi nomor WhatsApp brand dulu… Buka Profil" untuk owner; "Minta pemilik brand mengisinya" untuk admin) dan tombol konfirmasi nonaktif.
- **Sheet "Ikut event ini?"** (`JoinEventSheet`): ringkasan nama & tanggal event, dropdown opsional **Aturan fee jastip** (dimuat lazy saat sheet dibuka), dan — **khusus event partner** — kotak keterbukaan data: "Dengan ikut, {partner} bisa melihat nama brand, nomor WhatsApp, tanggal kamu ikut, dan jumlah pesananmu di event ini. Isi pesanan dan data customermu tidak ikut dibagikan." (`lib/join-disclosure.ts`; teksnya harus selalu cocok dengan kolom `listCalendarEventParticipants`).
- **Server** (`joinCalendarEvent` → `joinCalendarEventForBrand`), urutan cek: (1) brand sudah ikut → kembalikan event yang ada (idempoten); (2) event tidak ditemukan; (3) event tidak bisa diikuti lagi (`isCalendarEventJoinable`: sudah diakhiri atau tanggal terakhir lewat); (4) nomor WA brand kosong; (5) `feeRuleId` bukan milik brand. Pesan galat ada di `JOIN_ERRORS` (`lib/calendar-join.ts`).
- **Hasilnya** (`buildJoinedEventValues`): satu `events` baru dengan `name` disalin dari event kalender, `event_date` = tanggal mulai, `description` = "Lokasi: …" + baris kosong + deskripsi asli, `fee_rule_id` sesuai pilihan (atau kosong), `calendar_event_id` terisi, tanpa produk. Tanggal selesai dan flag online tidak ikut disalin. Setelah berhasil, user diarahkan ke `/events/:eventId`.
- Untuk event milik partner, di event belanja itu muncul tombol **Pakai paket** (4.4.1) dan etalase produk partner.

### 4.18 Admin: Event Kalender — `/admin/event`

Kelola event yang tampil di kalender semua jastiper. Semua handler (`lib/calendar-events-admin-functions.ts`) diawali `requireAdminUser()`.

- **Daftar** (`routes/admin/event/index.tsx`): header "Event — Event yang tampil di kalender semua user", tombol **Tambah** → `/admin/event/new`. Dua tab: **Mendatang** (urut tanggal naik) dan **Selesai** (tanggal lewat atau diakhiri; terbaru dulu), masing-masing dengan jumlah. Tidak ada pencarian/filter. Desktop berupa **tabel** dengan kolom Event, Tanggal, Lokasi, **Pembuat** (partner: nama + email; selain itu admin, default "Admin ALAKA"), Tipe, **Jastiper** (jumlah brand yang ikut = `count(distinct brand_id)` pada `events` dengan `calendar_event_id` itu), Status (Mendatang / Selesai / Diakhiri), Aksi; mobile berupa kartu ber-badge "Diakhiri", "Partner: …", dan "N jastiper".
- **Form** (`CalendarEventForm`; skema `calendarEventFieldsSchema`, `lib/calendar-event-input.ts`; batas di `CALENDAR_EVENT_LIMITS`):

| Field | Aturan |
| ----- | ------ |
| Online | Toggle wajib; kalau aktif label lokasi menjadi "Platform / tempat PO". Dipakai filter Lokasi di kalender |
| Nama | Wajib, maks 120 |
| Lokasi | Wajib, maks 200 |
| Tanggal | Tanggal ISO yang nyata (`isRealIsoDate` menolak mis. 2026-02-31); tipe kolom `date` polos (tanpa jam/zona) supaya tidak bergeser sehari akibat zona waktu |
| Tanggal selesai (opsional) | Tidak boleh sebelum tanggal mulai ("Tanggal selesai tidak boleh sebelum tanggal mulai"); kosong atau sama dengan tanggal mulai disimpan `null` (event sehari) |
| Deskripsi | Opsional, maks 2000 |
| Brand yang dipamerkan | Ketik dipisah koma; maks 30 item × 60 karakter; spasi dirapikan, kosong dibuang, duplikat (tanpa membedakan huruf besar/kecil) dihapus dengan ejaan pertama dipertahankan (`normalizeExhibitors`) |
| Banner | Opsional (lihat di bawah) |

- **Banner**: di client (`lib/calendar-banner-image.ts`) sumber maks 15 MB, di-crop **16:9**, diperkecil ke **1000×563** di atas latar putih, di-encode WebP (fallback JPEG, kualitas 0,85 → 0,7 → 0,55 → 0,4) sampai ≤ **300 KB** (kalau tak muat: "Gambar tidak bisa diperkecil"). Server (`parseCalendarBannerDataUrl`) memvalidasi ulang: hanya `data:image/webp|jpeg;base64`, ≤ 300 KB (`CALENDAR_BANNER_MAX_BYTES`), magic bytes cocok dengan tipe yang diklaim. Disimpan di Netlify Blobs store `calendar-banners` (key = id event); `calendar_event.banner_updated_at` menandai ada-tidaknya banner + cache-buster. Saat membuat event, banner disimpan dulu baru baris DB; kalau insert gagal, blob dihapus. Update menerima `banner: {type: 'upload' | 'remove'}` (tidak diisi = tidak berubah).
- **Halaman edit** (`/admin/event/:eventId`): form, tabel **"Jastiper yang ikut"** (`CalendarEventParticipants`: kolom Brand + nomor WA sebagai link, "Tanggal ikut", "Pesanan"; urut waktu ikut; tanpa export; datanya `listCalendarEventParticipants` yang juga dipakai Partner Portal), tombol **Akhiri event** (konfirmasi "Akhiri event?"; mengisi `ended_at`) / **Buka kembali event** (mengosongkannya), dan **Hapus event** (konfirmasi "Hapus event?"; hard delete + hapus blob banner). Event belanja jastiper yang sudah terbentuk tetap utuh — `events.calendar_event_id` menjadi `NULL` (`ON DELETE SET NULL`).

### 4.19 Admin: Partner — `/admin/partner`

Mengelola akun Partner (4.21). Semua fungsi di `lib/partner-functions.ts` (`*AdminPartner*`) dijaga `requireAdminUser()`.

- **Daftar**: pencarian nama/email + chip status **Semua / Aktif / Diundang / Nonaktif** (`partner-list-filters.ts`); tiap baris menampilkan logo (atau inisial), status, dan jumlah produk. Status (`partnerStatus()`): `nonaktif` kalau `disabled_at` terisi, `aktif` kalau `activated_at` terisi, selain itu `diundang`. Mobile berupa kartu, desktop berupa baris tabel.
- **Buat partner** (`createAdminPartner`): nama, email, nomor WA (opsional) → email undangan "Akun Partner ALAKA untuk {nama}" berisi link `/undangan-partner/:token`. Tidak ada daftar mandiri. Email tidak boleh sama dengan email akun jastiper (dijaga di kode: `partner-queries.ts`, `registerUser`, callback Google, undangan tim).
- **Ubah** (`updateAdminPartner`): kalau email diganti dan partner belum aktif, undangan lama dihanguskan dan yang baru dikirim; kalau sudah aktif, partner **dikeluarkan dari semua perangkat**. Mengubah partner nonaktif tidak mengirim email.
- **Kirim ulang undangan** (`resendAdminPartnerInvitation`): token lama dihanguskan, token baru dibuat; ditolak `SUDAH_AKTIF` kalau partner sudah membuat kata sandi.
- **Nonaktifkan / aktifkan** (`setAdminPartnerDisabled`): nonaktif = tidak bisa login / atur ulang kata sandi / menerima undangan dan **semua sesinya dimatikan**; data (produk, event) tetap utuh dan bisa diaktifkan lagi.
- **Hapus** (`deleteAdminPartner`): konfirmasi menyebut jumlah produk; menghapus akun, produk, dan file di Blobs (foto produk, logo, serta PDF katalog lama bila ada) **permanen**. Event kalender milik partner **tidak ikut terhapus** — `calendar_event.partner_id` menjadi `NULL` sehingga event menjadi event admin dan jastiper yang sudah ikut tetap utuh.

### 4.20 Admin: Langganan Partner — `/admin/langganan-partner`

Verifikasi langganan PRO partner (alur paralel dengan 4.13, tabel `partner_subscriptions`; fungsi di `lib/admin-partner-subscription-functions.ts`).

- Tab **Pending** (default) / **Aktif** / **Ditolak**; tiap baris menampilkan pengajuan beserta bukti transfer (disajikan lewat `/api/partner-subscription-proof/:id`). Baris aktif menampilkan `ends_at`, baris ditolak menampilkan catatan review.
- **Setujui** (`approvePartnerSubscription`, hanya dari `pending`): baris menjadi `active` dengan jendela dari `nextProWindow(activeRows, durationDays)` (perpanjangan menyambung dari masa aktif yang berlaku, sama seperti 5.6).
- **Tolak** (`rejectPartnerSubscription`, hanya dari `pending`): status `rejected` + catatan review.

### 4.21 Partner Portal — `/partner`

Area untuk **partner** (brand/penyelenggara) yang memamerkan produk di event kalender. Akunnya **sengaja terpisah** dari `users` (yang selalu terikat ke satu brand jastiper): tabel `partners`, sesi `partner_sessions`, cookie `alaka_partner_session` (30 hari), sehingga alur akun jastiper (trial, langganan, tim) tidak tersentuh. Login lewat halaman `/login` yang sama (4.1). Setiap server function partner diawali `requirePartner()` dan `partnerId` **selalu dari sesi**, tidak pernah dari input; `beforeLoad` di `routes/partner.tsx` hanya UX. Akses ke data milik partner lain mengembalikan "… tidak ditemukan".

#### 4.21.1 Akun & akses

- **Dibuat admin** (4.19), tidak ada daftar mandiri (halaman login menulis "Akun dibuat oleh admin ALAKA"). Undangan: token hash SHA-256, berlaku **7 hari** (`PARTNER_INVITATION_TTL_DAYS`), maks **5 undangan per partner per 24 jam** (`TERLALU_BANYAK_UNDANGAN`). Halaman `/undangan-partner/:token`: partner membuat kata sandi (min 8, `PARTNER_PASSWORD_MIN_LENGTH`); galat `UNDANGAN_KEDALUWARSA` / `UNDANGAN_SUDAH_DIPAKAI` / `UNDANGAN_TIDAK_DITEMUKAN`.
- **Login**: akun belum diaktifkan → `BELUM_AKTIF`; dinonaktifkan admin → `DINONAKTIFKAN` (hanya dilaporkan setelah kata sandi benar). Login Google ditolak untuk email partner.
- **Atur ulang kata sandi** (`/reset-sandi-partner/:token`, tabel `partner_password_reset_tokens`): berlaku **60 menit**, maks **3 permintaan per 15 menit**; permintaan baru menghanguskan token lama (`used_at`, barisnya tidak dihapus agar hitungan batas tetap benar).
- **Profil** (`/partner/profil`): ubah nama (maks 120) dan nomor WA (opsional, format Indonesia → disimpan `08…`), ganti kata sandi, dan **logo** (WebP/JPEG, persegi di-crop di client, ≤ 100 KB; Blobs key = id partner; `/api/partner-logo/:id?v=…`; tanpa logo tampil inisial).
- **Navigasi** (`PARTNER_TABS`, `components/partner-nav-items.ts`): **Beranda** `/partner`, **Katalog** `/partner/katalog`, **Paket** `/partner/paket`, **Event** `/partner/event`, **Profil** `/partner/profil`. Mobile memakai `PartnerBottomNav`; desktop memakai `PartnerSidebar` + `PartnerTopbar`. Daftar Katalog, Paket, dan Event memakai **paginasi** (4.22).

#### 4.21.2 Beranda (`getPartnerDashboard`)

Semua angka terbatas pada partner yang login. Jastiper = brand yang menekan **Ikut Event** di event milik partner (4.17.1).

- `activeProducts` — produk aktif; `productsThisMonth` — produk aktif yang dibuat sejak awal bulan (WIB).
- `jastiperCount` — brand unik yang ikut; `jastipersThisWeek` — yang ikut dalam 7 hari terakhir (rolling).
- `orderCount` — pesanan di event-event tersebut (hanya yang ada di event milik partner); `ordersThisWeek` — 7 hari terakhir.
- `recentJoins` — 5 jastiper terakhir yang ikut (nama brand, nama event, waktu relatif WIB: "hari ini", "kemarin", "N hari lalu").

#### 4.21.3 Katalog produk — `/partner/katalog`

- **Produk** (`partner_products`): nama (maks 120), kode/SKU (opsional, maks 40, tidak harus unik), deskripsi (maks 1000), harga (maks 999.999.999; `parseRupiah` menerima `189000`, `189.000`, `Rp189.000`, menolak desimal/negatif), foto (480×480, WebP/JPEG, ≤ 100 KB; `/api/partner-product-photo/:id?v=…`), dan `is_active`. Produk **tidak dihapus**, cukup dinonaktifkan, karena bisa sudah terpakai di event.
- **Varian** (toggle "Buat varian", **PRO**): grup opsi bertipe `ukuran` dan/atau `variasi` (maks satu grup per tipe per produk), nilai bebas per grup (variasi boleh berfoto motif), dan satu baris `partner_variants` per kombinasi yang benar-benar dijual dengan harga sendiri. Validasi `partner-variant-plan.ts`: nama dobel (tanpa membedakan huruf besar/kecil), ukuran di luar grup, kombinasi dobel, dan harga negatif ditolak; kombinasi tidak lengkap boleh. Varian yang pernah dipesan **dinonaktifkan** (bukan dihapus). Kolom stok & pre-order sudah ada tetapi belum dipakai.
- **Varian "Standar" otomatis**: produk tanpa varian tetap punya satu varian "Standar" berharga sama dengan harga induk (`syncDefaultVariant`), supaya paket dan item pesanan selalu menunjuk varian. Kalau `has_variants = false`, harga wajib diisi.
- Daftar punya tab (`PARTNER_PRODUCT_TABS`) dan jumlah event per produk di tabel desktop.

#### 4.21.4 Paket / aturan harga — `/partner/paket` (PRO)

- **Aturan paket** (`partner_pricing_rules`): nama (maks 80), `min_qty` (≥ 1), `bundle_price` (≥ 0), aktif/nonaktif. Artinya "**N pcs untuk Rp X**" — `bundle_price` adalah **HPP per paket** (harga beli jastiper dari partner), bukan harga jual ke pelanggan.
- **Produk dalam aturan** (`partner_rule_products`): satu produk hanya boleh di **satu** aturan (unique pada `partner_product_id`); `selectableProducts` menyembunyikan produk yang sudah di aturan lain.
- **Cara pakai oleh jastiper**: paket "mix-and-match" — jumlah qty komponen harus **tepat** `min_qty` (4.4.1). Helper `lineProfit` = `(harga jual − HPP + fee) × qty` tersedia, tetapi belum dipakai di UI; HPP tidak pernah memengaruhi tagihan.
- **PRO**: membuat/mengubah aturan dan memindahkan produk **ke dalam** aturan butuh PRO partner (`assertPro`: "Aturan paket membutuhkan langganan PRO partner."); mengeluarkan produk dari aturan tidak.

#### 4.21.5 Event partner — `/partner/event`

- **Buat event** (`createPartnerEvent`): baris `calendar_event` dengan `partner_id` = partner. Field: nama, lokasi, tanggal, tanggal selesai (opsional), Online/Offline, deskripsi, **link katalog** (opsional), banner (opsional, aturan sama dengan 4.18). **Brand yang dipamerkan otomatis = nama partner**, bukan input.
- **Link katalog** (`catalog_url`; `parseCatalogUrl`): hanya **https**, maks 2000 karakter; menolak `javascript:`, `http:`, `data:`, URL berkredensial, `localhost`, dan alamat IP. Katalog **tidak diunggah** ke ALAKA — hanya tautan (mis. Google Drive; `catalogDownloadUrl` menulis ulang link berkas Drive jadi link unduh langsung). Ini menggantikan katalog PDF & `partners.catalog_url` level partner yang sudah **tidak dipakai** (migrasi `0031`).
- **Status** (`PartnerEventStatusBadge`, `partnerEventStatus`): `selesai` (diakhiri manual atau tanggal terakhir lewat), `mendatang`, `berjalan` (sampai 23.59 WIB hari terakhir). Partner bisa mengakhiri/membuka kembali event (`setOwnPartnerEventEnded`) dan mengubahnya (`/partner/event/ubah/:id`, termasuk ganti/hapus banner).
- **Pilih produk event** (`/partner/event/produk/:id`, tabel `partner_event_products`): maksimal **6** produk unggulan (`MAX_EVENT_PRODUCTS`); produk aktif plus yang sudah terpilih (walau nonaktif, supaya bisa dilepas). Produk ini tampil di etalase jastiper (4.17) dan menentukan produk yang bisa dipakai di paket (4.4.1).
- **Detail** (`/partner/event/:id`): tab **Info** (tipe, tanggal, lokasi, "N bergabung" dan "N masuk" = pesanan), **Produk (N)**, dan **Jastiper (N)** — daftar brand peserta dengan nomor WA (link WhatsApp di desktop, `tel:` di mobile) — serta link ke Rekap. Daftar event berupa tabel di desktop.

#### 4.21.6 Rekap pesanan — `/partner/event/rekap/:id`

Daftar packing: seberapa banyak tiap produk dipesan jastiper di event partner (`getPartnerEventPicklist`, `buildPicklist` di `lib/partner-picklist-rules.ts`).

- Sumber: `events` yang terhubung ke event kalender partner → pesanan → item. Barang satuan memakai produk/ukuran/variasi dari varian partner; paket memakai `item_components`.
- Qty dijumlah per **produk + ukuran + variasi + sumber** (satuan atau aturan paket tertentu); baris qty ≤ 0 diabaikan; urut nama produk → ukuran → variasi → aturan. Setiap baris juga memuat **rincian per jastiper** (`byJastiper`: nama brand + qty).
- Filter chip: **Semua**, **Satuan**, dan satu chip per aturan paket.
- **Catatan privasi**: rekap menampilkan **nama brand + qty produk partner itu sendiri** per jastiper. Teks keterbukaan di sheet Ikut Event (4.17.1) menyebut hanya jumlah pesanan yang dibagikan dan "isi pesanan … tidak ikut dibagikan"; rekap ini sedikit lebih rinci daripada janji teks itu (hanya untuk produk/paket partner sendiri). Selaraskan teks atau cakupan rekap kalau ingin konsisten.

#### 4.21.7 Langganan PRO partner

Aturannya ada di 5.8; pengajuan lewat kartu `PartnerSubscriptionCard` di profil partner (bukti transfer PNG/JPEG/WEBP ≤ 1 MB → Blobs), diverifikasi admin di 4.20.

### 4.22 Paginasi

Komponen `ui/Pagination.tsx` + `lib/pagination.ts` (`PAGE_SIZE_OPTIONS` 10/20/50, `DEFAULT_PAGE_SIZE` 10, `MAX_PAGE_SIZE` 100; skema `pageParamsSchema`, `clampPage` — server yang menentukan halaman akhir). Saat ini hanya dipakai di daftar **Katalog**, **Paket**, dan **Event** di Partner Portal. Beranda, Customer (jastiper), dan daftar admin memuat semua baris sekaligus dan memfilter di client.

## 5. Paket & Entitlement (Trial / FREE / PRO)

Tiga status akses, dihitung **per brand** (semua anggota brand — owner dan admin — berbagi satu paket). Seluruh aturannya ditulis di `src/lib/subscription.ts` (modul murni tanpa `db`, jadi dipakai bersama server & client) dan dihitung ulang setiap kali dibutuhkan.

| Plan  | Cara dapat                                                                    | Akses fitur                            |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Trial | Otomatis, 30 hari sejak brand dibuat (`TRIAL_DAYS`)                           | Semua fitur terbuka                    |
| FREE  | Otomatis setelah trial habis (atau setelah masa PRO habis)                    | Fitur dasar saja, 2 fitur PRO terkunci |
| PRO   | Langganan 30 hari (`PRO_DURATION_DAYS`) yang pembayarannya diverifikasi admin | Semua fitur terbuka                    |

### 5.1 Cara status dihitung

- **Tidak ada kolom `is_pro`.** Status dihitung dari dua sumber: (1) kolom `brands.trial_started_at` + `brands.trial_ends_at` untuk masa trial, (2) histori tabel `subscriptions` (diikat lewat `brand_id`) — baris `status = 'active'` yang `ends_at`-nya belum lewat berarti PRO.
- Prioritas: **PRO aktif > trial belum habis > FREE** (fungsi `resolveEntitlement`).
- Nilai trial diisi **DEFAULT kolom di database** (tabel `brands`), bukan diset di kode, supaya semua jalur pembuatan brand (register email, Google OAuth, seed) otomatis kebagian trial yang sama.
- Aturan buka/tutup fitur ditulis **satu kali** di `featuresForPlan(plan)`: `plan !== 'free'` → semua fitur PRO terbuka. Fungsi inilah yang dibaca server & client, jadi tidak ada lagi pengecekan `isPro` yang tersebar sendiri-sendiri.
- Entitlement yang dikirim ke client (lewat `fetchCurrentUser`) berisi: `plan`, `isTrial`, `isPro`, `proUntil`, `trialStartedAt`, `trialEndsAt`, `trialDaysLeft`, dan `features` (satu flag per fitur PRO).

### 5.2 Daftar fitur PRO (kunci + gerbang server)

| Kunci fitur            | Fitur                                                              | Gerbang server                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `billing`              | Tagih: halaman invoice internal, kirim WA, dan link tagihan publik | `requireFeature(getUserEntitlements(user), 'billing')` di `getOrderInvoice`; di `getPublicOrderInvoice` ada aturan grandfathering (5.5) |
| `payment_methods`      | Tambah / edit / hapus / aktif-nonaktif metode pembayaran           | `requireUserFeature('payment_methods')` di 4 server function tulis — baca daftar tetap terbuka                                          |

Saran pesanan (`order_suggestions`), saran fee (`fee_suggestions`), dan saran pelanggan (`customer_suggestions`) **bukan** fitur PRO — ketiganya terbuka untuk semua paket (termasuk FREE), jadi tidak punya gerbang di server. Endpoint saran selalu mengirim data apa adanya.

Label & deskripsi tiap kunci (`PRO_FEATURE_INFO`), label/deskripsi plan (`PLAN_INFO`, `planLabel()`), dan pesan seragam `featureLockedMessage()` juga tinggal di `src/lib/subscription.ts` — jadi teks UI dan pesan server tidak bisa beda.

### 5.3 Gerbang server (yang mengikat)

- Pintu masuknya `src/lib/entitlements.ts`: `getUserEntitlements(user)` (hitung status) → `requireFeature()` / `requireUserFeature()` yang melempar `FeatureLockedError` (`code = 'FEATURE_LOCKED'`, pesannya siap ditampilkan) kalau fiturnya terkunci.
- Server function **tidak boleh** menulis `plan === 'pro'` sendiri; selalu lewat helper di atas.
- Endpoint saran (`order_suggestions`, `fee_suggestions`, `customer_suggestions`) tidak punya gerbang entitlement — fitur dasar, jadi selalu mengembalikan data saran ke semua paket (termasuk FREE).
- Karena pengecekannya di server, UI yang diakali (memanggil endpoint langsung) tetap ditolak.

### 5.3 Fitur dasar (bukan PRO)

Saran pesanan, saran fee, dan saran pelanggan adalah fitur dasar yang terbuka untuk semua paket (trial, FREE, maupun PRO). Endpoint-nya (`getOrderSuggestions`, `getFeeSuggestions`, `getCustomerSuggestions`) tidak melakukan pengecekan entitlement — mereka selalu mengirim data saran selama user sudah login.

### 5.4 Perilaku UI saat fitur terkunci

- `ProBadge` — penanda kecil "PRO" pada kontrol yang terkunci.
- `ProLockPrompt` — dialog seragam untuk fitur terkunci: penjelasan fiturnya, isi paket PRO, status plan user saat ini, lalu tombol **"Upgrade ke PRO"** (menuju `/profil/langganan`) dan "Nanti saja".
- Kontrol yang tampil terkunci di paket FREE: tombol **Tagih** di Detail Event (gembok + badge PRO; klik = dialog upgrade), serta tombol "Tambah metode pembayaran" dan toggle aktif-nonaktif metode (semua aksi tulis dialihkan ke dialog upgrade). Fitur saran (pesanan, fee, pelanggan) tidak lagi terkunci karena sudah jadi fitur dasar.
- Baris **Langganan** di Profil menampilkan status paket + chip **Upgrade** (khusus FREE) sebagai jalan masuk ke halaman Paket & Langganan.
- Semua kunci di UI dibaca dari `canUseFeature(entitlements, '<kunci fitur>')` — komponen tidak menghitung status plan sendiri.

### 5.5 Grandfathering (agar tidak merusak data yang sudah beredar)

- Link tagihan publik (`/tagihan/:eventId/:orderId`) untuk pesanan yang dibuat saat pemiliknya masih punya akses penuh **tetap bisa dibuka** walau sekarang paketnya FREE — dicek dengan `hasFullAccessAtForUser(owner, order.createdAt)`. Alasannya link itu sudah terlanjur dikirim ke pelanggan lewat WhatsApp.
- Ringkasnya: **akses sekarang** menentukan boleh-tidaknya membuat/membuka invoice baru; **akses saat pesanan dibuat** dipakai untuk menoleransi link lama.

### 5.6 Aktivasi PRO (alur yang berjalan sekarang)

- Pembayaran **manual** (QRIS — statis atau dinamis bernominal, lihat 4.12; diatur admin), verifikasi oleh **admin** di `/admin` (lihat 4.13). Pengajuan hanya bisa dikirim oleh **owner** brand dengan **email terverifikasi**.
- Tabel `subscriptions` menyimpan semuanya: durasi (`duration_days`), periode PRO (`started_at` / `ends_at`), info pembayaran (nominal, metode, provider, nama pengirim, referensi transfer, bukti transfer, tanggal bayar, catatan), plus kolom hasil review admin (`reviewed_by`, `reviewed_at`, `review_note`).
- Maksimal **satu baris `pending` per brand** (unique index `subscriptions_pending_per_brand_unique`; yang per user `subscriptions_pending_per_user_unique` masih ada), jadi bukti transfer tidak bisa dikirim dobel sebelum yang lama diproses.
- Alurnya lengkap dua sisi: member mengajukan lewat `/profil/langganan` (`submitSubscriptionRequest` — upload bukti transfer, nominal di-snapshot dari harga admin), admin memverifikasi lewat `approveSubscription` / `rejectSubscription`.
- Helper yang dipakai kedua sisi: `nextProWindow()` (perpanjangan menambah dari `ends_at` yang masih aktif, bukan dari hari ini), `listSubscriptions()`, `listActiveSubscriptions()`, `findPendingSubscription()`, `getSubscriptionState()`.
- Yang **belum** ada: penetapan/pencabutan PRO manual tanpa pengajuan, pengiriman email/notifikasi saat status berubah, dan job yang menandai baris `expired` (masa habis saat ini cukup dideteksi dari `ends_at` di `resolveEntitlement()`) — lihat 9.

### 5.7 Pengaturan pembayaran PRO (admin)

- Harga membership PRO **bukan konstanta di kode**: disimpan di tabel singleton `subscription_settings` (`pro_price`, plus `original_price` opsional untuk harga coret — murni tampilan) dan diubah admin dari `/admin/pengaturan` (lihat 4.14). Durasi PRO tetap konstanta `PRO_DURATION_DAYS` (30 hari). Harga yang sama dipakai untuk langganan PRO **partner** (5.8).
- QRIS pembayaran ada di tabel yang sama: gambar statis (`qris_image`, data URL base64, maks 1MB) dan payload mentah (`qris_string`, untuk membuat QRIS dinamis bernominal di client) — dibaca member lewat `fetchSubscriptionPaymentInfo()` dan ditulis admin lewat `updateSubscriptionQris()`. Barisnya cuma satu: `getSubscriptionSettings()` ambil baris pertama dan update-nya selalu upsert.
- `subscriptions.amount` di-snapshot dari harga tersebut **saat pengajuan dibuat**, jadi mengubah harga tidak mengubah nominal pengajuan yang sudah masuk (dan sebaliknya, nominal lama tidak berubah walau harga dinaikkan).

### 5.8 Langganan PRO Partner

Partner (4.21) punya langganan sendiri, **terpisah** dari langganan brand jastiper: tabel `partner_subscriptions`, entitlement di `lib/partner-entitlement.ts`.

- **Tidak ada trial dan tidak ada batas jumlah produk/event/aturan.** Semua fitur partner gratis kecuali yang tercantum di `PARTNER_PRO_FEATURES` (sekarang satu kunci: `partner_variants`). `hasPartnerPro(subs)` benar kalau ada langganan `active` yang masa berlakunya masih berjalan.
- **Terkunci tanpa PRO**: membuat **varian produk** (`savePartnerProductVariants`: "Fitur varian membutuhkan langganan PRO partner.") dan **aturan paket** (`assertPro`: "Aturan paket membutuhkan langganan PRO partner."; memindahkan produk ke dalam aturan juga, mengeluarkannya tidak).
- **Dampak di sisi jastiper**: `getEventPartnerCatalog` hanya menampilkan aturan paket kalau partner-nya PRO, dan `buildPartnerBundle` menolak ("Fitur paket belum aktif untuk partner ini."). Jadi ketika PRO partner habis, paket yang sudah terlanjur dipesan tetap ada, tetapi paket baru tidak bisa ditambahkan.
- **Alur pengajuan** (`partner-subscription-functions.ts`, `PartnerSubscriptionCard`): `submitPartnerSubscriptionRequest` mengunggah bukti transfer (PNG/JPEG/WEBP, maks 1 MB) ke Blobs dan membuat baris `pending` (`plan_code = PRO_PLAN_CODE`, `duration_days = PRO_DURATION_DAYS`, `amount` = snapshot `subscription_settings.pro_price`). Maksimal satu `pending` per partner ("Kamu masih punya pengajuan yang menunggu verifikasi."). `fetchPartnerSubscriptionPaymentInfo` memakai pengaturan harga/QRIS yang **sama** dengan langganan jastiper; verifikasi admin di 4.20.

## 6. Navigasi

Navigasi member: bottom tab bar (5 slot), fixed, dengan `padding-bottom: env(safe-area-inset-bottom)` untuk safe area. Max width 480px.

| Icon          | Tab                    | Route          | Isi                                                       |
| ------------- | ---------------------- | -------------- | --------------------------------------------------------- |
| 🏠 Home       | Beranda                | `/`            | List event aktif + ringkasan keuangan                     |
| 💰 Wallet     | Keuangan               | `/keuangan`    | Dashboard keuangan global                                 |
| ➕ Plus (FAB) | Tambah (FAB, menonjol) | `/pesanan/new` | Pemilih event aktif → sheet Tambah Pesanan (4.11)         |
| 📅 Calendar   | Event                  | `/kalender`    | Kalender event global + Ikut Event (4.17)                 |
| 👤 User       | Profil                 | `/profil`      | Settings & akses ke fitur sekunder                        |

Tab Beranda aktif hanya pada `/` persis. Halaman detail (Detail Event, Fee Rules, Customers, Invoice, detail event kalender) menyembunyikan bottom nav dan menggunakan header dengan tombol back. Path yang menyembunyikan bottom nav: prefix `/events/`, `/profil/fee-rules`, `/profil/customers`, `/invoice/`, serta `/kalender/<id>` (`isCalendarDetailPath` di `lib/calendar.ts`; daftar `/kalender` tetap menampilkan nav). Sub-halaman profil lain (`/profil/tim`, `/profil/langganan`, `/profil/pembayaran`, `/profil/template-chat`) **tetap** menampilkan nav.

Area lain punya navigasi sendiri: **Admin** — 6 tab (4.13); **Partner** — 5 tab (4.21.1). Keduanya memakai bottom tab di mobile dan sidebar di desktop.

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
dipasang sebagai **bottom tab sendiri** di mobile (`AdminBottomNav`, 6 tab: **Dashboard /
Customer / Event / Partner / PRO Partner / Pengaturan**, halaman aktif ditandai warna aksen)
dan sidebar (`AdminSidebar`) di desktop. Tombol **Keluar** ada
di `/admin/pengaturan`, bukan di header. User dengan `is_admin = true` yang membuka
halaman member otomatis dipindahkan ke `/admin`, dan login / callback Google admin
mendarat di `/admin` (lihat 4.13–4.15, 4.18–4.20).

## 7. Skema Database

```sql
-- Ringkasan: semua timestamp = timestamptz (migrasi 0006; zona app Asia/Jakarta, lib/timezone.ts).
-- Data bisnis dimiliki BRAND (brand_id NOT NULL, cascade delete). Kolom user_id di tabel data
-- = "dibuat oleh" (nullable, SET NULL kalau akunnya dihapus), bukan pemilik.

-- BRANDS (satu brand = satu "toko" jastip; pemilik semua data bisnis)
brands
  id                uuid primary key (brands.id BUKAN id user mana pun — pakai brand.id / session.brandId)
  name              varchar (nullable)
  avatar_updated_at timestamptz (nullable)  -- penanda foto brand di Netlify Blobs + cache-buster ?v=
  wa_message_template text (nullable)       -- template chat WA kustom
  wa_number         varchar (nullable)      -- nomor WA brand; wajib terisi untuk Ikut Event
  trial_started_at  timestamptz NOT NULL default now()
  trial_ends_at     timestamptz NOT NULL default now() + interval '30 days'  -- TRIAL_DAYS
  created_at, updated_at
  -- constraint: trial_ends_at >= trial_started_at

-- USERS & AUTH
users                                      -- murni akun orangnya
  id                uuid primary key
  name              varchar NOT NULL
  email             varchar unique NOT NULL
  password_hash     varchar (nullable)   -- null jika login via Google saja
  google_id         varchar unique (nullable)
  email_verified_at timestamptz (nullable) -- null = belum terverifikasi
  is_admin          boolean NOT NULL default false  -- admin ALAKA (/admin), diaktifkan manual lewat DB
  brand_id          uuid NOT NULL → brands.id (RESTRICT)
  brand_role        enum('owner','admin') NOT NULL default 'owner'
  created_at, updated_at
  -- index: brand_id; unique parsial: satu owner per brand (users_one_owner_per_brand)

brand_invitations                          -- undangan admin brand lewat email
  id                uuid primary key
  brand_id          uuid → brands.id (cascade)
  email             varchar NOT NULL  -- selalu huruf kecil (check)
  role              brand_role NOT NULL default 'admin'  -- check: bukan 'owner'
  token_hash        varchar unique NOT NULL  -- SHA-256, token mentah tak disimpan
  status            enum('pending','accepted','revoked','expired') NOT NULL default 'pending'
  invited_by, accepted_by  uuid → users.id (set null)
  expires_at        timestamptz NOT NULL
  created_at, accepted_at, revoked_at
  -- unique parsial: satu undangan pending per (brand_id, email)

sessions
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  token             varchar unique NOT NULL
  expires_at        timestamptz NOT NULL
  created_at

password_reset_tokens
  id                uuid primary key
  user_id           uuid → users.id (cascade delete)
  token_hash        varchar unique NOT NULL  -- SHA-256 hash dari token mentah
  expires_at        timestamptz NOT NULL
  used_at           timestamptz (nullable)   -- diisi saat token dipakai/hangus
  created_at

email_verification_tokens                  -- pola sama dengan password_reset_tokens
  id, user_id (cascade), token_hash unique, expires_at, used_at, created_at
```

```sql
-- SUBSCRIPTIONS (histori langganan PRO brand — pembayaran manual, diverifikasi admin)
subscriptions
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)  -- siapa yang mengajukan
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  plan_code         varchar NOT NULL default 'pro'      -- PRO_PLAN_CODE
  status            enum('pending','active','expired','rejected') NOT NULL default 'pending'
  duration_days     integer NOT NULL default 30         -- PRO_DURATION_DAYS
  started_at        timestamptz (nullable)  -- diisi saat status jadi 'active'
  ends_at           timestamptz (nullable)  -- akhir masa PRO (dasar resolveEntitlement)
  -- info pembayaran (diisi saat mengajukan)
  amount              decimal(12,2) NOT NULL default 0
  payment_method      enum('bank','wallet','qris') (nullable)
  payment_provider    varchar (nullable)  -- "BCA", "GoPay"
  payment_sender_name varchar (nullable)  -- nama pengirim, buat dicocokkan admin
  payment_reference   varchar (nullable)  -- no. referensi / 4 digit terakhir
  payment_proof_image text (nullable)     -- bukti LAMA (data URL base64); pengajuan baru tidak mengisi
  payment_proof_stored boolean NOT NULL default false  -- true = bukti ada di Netlify Blobs (store payment-proofs, key = id)
  payment_note        text (nullable)
  paid_at             timestamptz (nullable)  -- tanggal user mengaku transfer
  -- hasil verifikasi manual admin
  reviewed_by       uuid → users.id (set null) (nullable)
  reviewed_at       timestamptz (nullable)
  review_note       text (nullable)
  created_at, updated_at
  -- index: (user_id, created_at), (brand_id, created_at), status
  -- unique parsial: maksimal satu `pending` per brand DAN per user
  -- constraint: amount >= 0; ends_at >= started_at (kalau keduanya terisi)

-- SUBSCRIPTION SETTINGS (baris tunggal pengaturan pembayaran PRO, diatur admin)
subscription_settings
  id                uuid primary key
  qris_image        text (nullable)     -- gambar QRIS statis (data URL base64)
  qris_string       text (nullable)     -- payload QRIS statis mentah (EMVCo) → dasar QRIS dinamis di client
  pro_price         decimal(12,2) NOT NULL default 0  -- harga membership PRO yang berlaku
  original_price    decimal(12,2) (nullable)          -- harga coret (tampilan saja)
  updated_at        timestamptz
  updated_by        uuid → users.id (set null) (nullable)
  -- singleton: cukup satu baris, dibaca getSubscriptionSettings() (ambil baris pertama)
  -- pro_price di-snapshot ke subscriptions.amount / partner_subscriptions.amount tiap ada pengajuan baru
```

```sql
-- FEE RULES (Manajemen Fee)
fee_rules
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)  -- dibuat oleh
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  name              varchar NOT NULL
  created_at, updated_at

fee_tiers
  id                uuid primary key
  fee_rule_id       uuid → fee_rules.id (cascade delete)
  min_price         decimal(12,2) NOT NULL
  max_price         decimal(12,2) NOT NULL
  fee_amount        decimal(12,2) NOT NULL
  created_at
  -- tidak boleh overlap antar tier dalam fee_rule yang sama:
  -- divalidasi di application layer + server sebelum insert/update (bukan constraint DB)

-- CUSTOMERS
customers
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)  -- dibuat oleh
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  name              varchar NOT NULL
  phone             varchar (nullable)
  address           text (nullable)  -- alamat customer, opsional
  created_at, updated_at
  deleted_at        timestamptz (nullable)  -- soft delete

-- PAYMENT METHODS
payment_methods
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)  -- dibuat oleh
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  type              enum('bank','wallet','qris') NOT NULL
  provider          varchar NOT NULL        -- "BCA", "GoPay", "QRIS"
  account_number    varchar (nullable)      -- no. rekening / no. HP wallet
  account_name      varchar (nullable)      -- atas nama (opsional)
  qris_image        text (nullable)         -- data URL base64 (image/png|jpeg|webp)
  is_active         boolean NOT NULL default true
  created_at, updated_at
```

-- EVENTS (event belanja milik brand)
events
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)  -- dibuat oleh
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  fee_rule_id       uuid → fee_rules.id (set null on delete) (nullable)
  calendar_event_id uuid → calendar_event.id (set null on delete) (nullable)  -- diisi kalau dibuat lewat "Ikut Event"
  name              varchar NOT NULL
  description       text (nullable)
  event_date        timestamptz NOT NULL
  is_active         boolean NOT NULL default true  -- nonaktif = event ditutup (bukan hapus)
  hide_fee          boolean NOT NULL default false -- true = invoice/tagihan tidak memecah "harga + fee"
  created_at, updated_at
  -- index: brand_id, calendar_event_id
  -- unique parsial: (brand_id, calendar_event_id) WHERE calendar_event_id IS NOT NULL → satu brand sekali per event kalender

-- ORDERS & ITEMS
orders
  id                uuid primary key
  event_id          uuid → events.id (cascade delete)
  customer_name     varchar NOT NULL
  customer_phone    varchar (nullable)
  payment_status    enum('unpaid','dp','paid','shipped') NOT NULL default 'unpaid'
  paid_amount       decimal(12,2) NOT NULL default 0  -- nominal yang sudah dibayar (DP support)
  created_at, updated_at

items
  id                uuid primary key
  order_id          uuid → orders.id (cascade delete)
  name              varchar NOT NULL
  original_price    decimal(12,2) NOT NULL
  fee               decimal(12,2) NOT NULL  -- fee berlaku PER UNIT (per qty)
  qty               integer NOT NULL default 1
  obtained          boolean NOT NULL default false  -- checklist live shopping
  is_bundle         boolean NOT NULL default false  -- true = paket baru (punya item_components); paket lama bernama "A + B" tetap false
  partner_variant_id uuid → partner_variants.id (set null) (nullable)  -- hanya barang dari produk partner
  partner_rule_id   uuid → partner_pricing_rules.id (set null) (nullable) -- terisi = baris paket partner (TERKUNCI, 4.4.1)
  hpp               decimal(12,2) (nullable)  -- HPP per unit (snapshot): harga paket / harga varian
  created_at

item_components                            -- isi sebuah paket, satu baris per barang (snapshot nama/ukuran/variasi)
  id                uuid primary key
  item_id           uuid → items.id (cascade delete)
  partner_variant_id uuid → partner_variants.id (set null) (nullable)
  product_name      varchar NOT NULL
  size, variation   varchar (nullable)
  qty               integer NOT NULL default 1  -- check: qty > 0; total pcs = items.qty × qty

-- ACTIVITY LOGS (tabel siap, belum ada kode yang menulis / UI-nya — lihat 9)
activity_logs
  id                uuid primary key
  user_id           uuid → users.id (set null) (nullable)
  brand_id          uuid NOT NULL → brands.id (cascade delete)
  action            varchar NOT NULL
  entity_type       varchar NOT NULL
  entity_id         uuid NOT NULL
  metadata          jsonb (nullable)
  created_at
```

```sql
-- KALENDER EVENT (GLOBAL — tanpa brand_id; diinput admin ALAKA atau partner)
calendar_event
  id                uuid primary key
  name              varchar NOT NULL
  location          varchar NOT NULL
  event_date        date NOT NULL           -- tanggal polos (tanpa jam/zona)
  end_date          date (nullable)         -- tanggal terakhir (inklusif); null = event sehari
  is_online         boolean NOT NULL default false
  ended_at          timestamptz (nullable)  -- diisi "Akhiri event"; non-null = hilang dari daftar user
  description       text (nullable)
  banner_updated_at timestamptz (nullable)  -- penanda banner di Netlify Blobs (store calendar-banners) + ?v=
  catalog_url       varchar (nullable)      -- link katalog event partner (tidak diunggah ke ALAKA)
  exhibitors        text[] NOT NULL default '{}'  -- nama brand yang dipamerkan (teks bebas, BUKAN relasi ke brands)
  created_by        uuid → users.id (set null) (nullable)  -- admin ALAKA penginput
  partner_id        uuid → partners.id (set null) (nullable)  -- null = event buatan admin
  created_at, updated_at
  -- index: event_date, partner_id

-- PARTNER PORTAL (akun terpisah dari users; email partner tidak boleh sama dengan email users — dijaga di kode)
partners
  id                uuid primary key
  name              varchar NOT NULL
  email             varchar unique NOT NULL  -- huruf kecil (check)
  password_hash     varchar (nullable)       -- null = undangan belum diterima
  wa_number         varchar (nullable)
  activated_at      timestamptz (nullable)   -- null = masih "Diundang"
  disabled_at       timestamptz (nullable)   -- non-null = dinonaktifkan admin (tak bisa login; data utuh)
  logo_updated_at   timestamptz (nullable)   -- penanda logo di Blobs + ?v=
  created_by        uuid → users.id (set null) (nullable)
  created_at, updated_at
  -- DEPRECATED (tidak dipakai): catalog_pdf_name, catalog_pdf_size, catalog_pdf_updated_at, catalog_url
  --   (digantikan calendar_event.catalog_url, migrasi 0031)

partner_sessions                           -- id, partner_id (cascade), token unique, expires_at, created_at
partner_invitation_tokens                  -- id, partner_id (cascade), token_hash unique, expires_at, used_at, created_at
partner_password_reset_tokens              -- id, partner_id (cascade), token_hash unique, expires_at, used_at, created_at

partner_subscriptions                      -- langganan PRO partner; kolom = subscriptions (tanpa user_id/brand_id/payment_proof_image)
  id, partner_id (cascade), plan_code, status, duration_days, started_at, ends_at,
  amount, payment_method, payment_provider, payment_sender_name, payment_reference,
  payment_proof_stored (bukti di Blobs), payment_note, paid_at,
  reviewed_by, reviewed_at, review_note, created_at, updated_at
  -- index: (partner_id, created_at), status

partner_products                           -- katalog produk partner (dinonaktifkan, tidak dihapus)
  id                uuid primary key
  partner_id        uuid → partners.id (cascade delete)
  name              varchar NOT NULL
  code              varchar (nullable)       -- SKU buatan partner, tidak harus unik
  price             decimal(12,2) (nullable) -- harga induk; wajib kalau has_variants = false
  has_variants      boolean NOT NULL default false
  description       text (nullable)
  is_active         boolean NOT NULL default true
  photo_updated_at  timestamptz (nullable)   -- foto di Blobs + ?v=
  created_at, updated_at
  -- check: price >= 0; has_variants OR price IS NOT NULL

partner_event_products                     -- produk unggulan per event (maks 6, divalidasi di kode)
  calendar_event_id uuid → calendar_event.id (cascade)
  product_id        uuid → partner_products.id (cascade)
  created_at
  -- primary key: (calendar_event_id, product_id)

partner_option_groups                      -- grup opsi per produk
  id, partner_product_id (cascade), type enum('ukuran','variasi'), position
  -- unique: (partner_product_id, type)
partner_option_values                      -- nilai di dalam grup (S/M/L, nama motif)
  id, option_group_id (cascade), name, position, image_url (hanya grup variasi)
  -- unique: (option_group_id, name)
partner_variants                           -- satu baris per kombinasi yang dijual
  id, partner_product_id (cascade), price decimal(12,2) NOT NULL (>= 0), sku, is_active,
  track_stock, stock_qty, allow_preorder  -- kolom stok/pre-order disiapkan, belum dipakai
  created_at
partner_variant_values                     -- penghubung varian ↔ nilai
  variant_id (cascade), option_value_id (cascade)  -- primary key: gabungan keduanya

partner_pricing_rules                      -- aturan paket "N pcs Rp X"
  id, partner_id (cascade), name, min_qty integer (> 0), bundle_price decimal(12,2) (>= 0; = HPP per paket),
  is_active, position, created_at
partner_rule_products                      -- produk yang masuk aturan
  rule_id (cascade), partner_product_id (cascade)
  -- primary key: gabungan; unique pada partner_product_id → satu produk hanya di satu aturan
```

### Catatan penting skema

- **Isolasi multi-tenant lewat brand**: data bisnis dimiliki **brand**, bukan akun. `fee_rules`, `customers`, `payment_methods`, `subscriptions`, `events`, dan `activity_logs` punya `brand_id NOT NULL` (cascade delete) dan difilter langsung via `brand_id`; `orders` difilter via join ke `events.brand_id`, `items` via `orders → events.brand_id`. Kolom `user_id` di tabel-tabel itu hanya penanda "dibuat oleh" (nullable, `SET NULL` saat akunnya dihapus). Semua query harus memakai `brand.id` / `session.brandId`, **jangan** `user.id` (termasuk key file di Blobs).
- **Fee disimpan di `items`, bukan dihitung ulang** — supaya histori transaksi tidak berubah kalau `fee_tiers` diedit/dihapus di kemudian hari.
- **Status `dp`**: pesanan bisa berstatus DP dengan `paid_amount` yang diisi sebagian dari total tagihan. Sisa tagihan = `total - paid_amount`.
- **`obtained` di `items`**: dipakai untuk checklist live shopping — menandai barang sudah didapat di toko.
- **Barang bundling**: ada dua bentuk. (1) **Bundling manual (lama)** — nama-nama barang dalam satu paket digabung jadi satu string dipisah `" + "` (mis. `"Kaos + Celana + Topi"`) di satu baris `items`, `is_bundle = false`, tanpa `item_components`; harga/fee tetap per paket (`lib/item-bundle.ts`). (2) **Paket partner (baru)** — satu baris `items` dengan `is_bundle = true`, `partner_rule_id`, dan `hpp`, plus baris `item_components` sebagai snapshot isinya (4.4.1). Baris dengan `partner_rule_id` terisi **terkunci** dari edit biasa.
- **`is_active` di `events`**: nonaktif ≠ hapus. Event nonaktif disembunyikan dari daftar "Event aktif" di beranda dan ditolak saat `createOrder`, tapi barisnya, pesanannya, dan tagihannya tetap ada; diatur dari menu tiga titik di halaman Detail Event. Ringkasan uang (beranda & Keuangan) tetap menghitung event nonaktif karena uangnya nyata.
- **`hide_fee` di `events`**: hanya mengubah **tampilan** invoice/tagihan/pesan WA (harga nett, tanpa memecah fee); fee tetap tersimpan per item dan total tidak berubah.
- **`calendar_event_id` di `events`**: tautan event belanja ke event kalender yang diikuti ("Ikut Event"); `SET NULL` kalau event kalendernya dihapus. Tidak ada tabel peserta — daftar peserta event kalender adalah `events` dengan `calendar_event_id` itu (4.17.1).
- **`calendar_event` global**: tidak punya `brand_id`; dibuat admin ALAKA (`partner_id` null) atau partner (`partner_id` terisi). Partner dihapus → `partner_id` jadi null dan event menjadi event admin.
- **Partner terpisah dari `users`**: `partners` + sesi/token sendiri karena `users.brand_id` NOT NULL; email antar kedua tabel tidak boleh bentrok (dijaga di kode).
- **`password_hash` nullable**: user yang hanya mendaftar via Google tidak punya password; tampilan Profil menyesuaikan. `partners.password_hash` null = undangan belum diterima.
- **`wa_message_template` di `brands`**: template default ada di `src/lib/message-template.ts`. Jika null, dipakai template default.
- **Status langganan tidak disimpan sebagai flag**: tidak ada kolom `is_pro`. Masa trial ada di `brands.trial_started_at` / `brands.trial_ends_at`, sedangkan status PRO dihitung dari baris `subscriptions` (per `brand_id`) berstatus `active` yang `ends_at`-nya belum lewat (lihat 5.1).
- **`subscriptions` bersifat histori, bukan state**: satu baris = satu pengajuan/pembelian, riwayat pembayaran selalu bisa diaudit. Verifikasi admin mengubah baris `pending` itu sendiri jadi `active` dan **menggeser jendelanya** (`started_at` / `ends_at` dihitung `nextProWindow()`: perpanjangan menyambung dari `ends_at` yang masih berlaku), jadi tidak ada baris tambahan saat perpanjangan. Status `expired` sudah ada di enum tapi belum pernah ditulis otomatis oleh kode mana pun — masa habis cukup dideteksi dari `ends_at` saat menghitung entitlement. `partner_subscriptions` mengikuti pola yang sama untuk partner.
- **Kolom `payment_*` di `subscriptions`**: info pembayaran disimpan di tabel yang sama supaya admin bisa mencocokkan transfer tanpa tabel tambahan. **Bukti transfer baru disimpan di Netlify Blobs** (`payment_proof_stored = true`, maks 1MB); kolom `payment_proof_image` (base64) hanya untuk bukti lama. `payment_methods.qris_image` dan `subscription_settings.qris_image` masih berupa data URL base64.
- **`is_admin` ditandai di DB, bukan di UI**: kolom `users.is_admin` (default `false`) cuma diaktifkan manual lewat `pnpm db:studio` oleh pemilik aplikasi — sengaja tidak ada jalur self-service dari aplikasi supaya tidak ada yang bisa mengangkat dirinya jadi admin. Nilainya dipakai `requireAdminUser()` (`src/lib/admin.ts`) di server dan `fetchCurrentUser()` di client. Ini **terpisah** dari `users.brand_role` (owner/admin brand).
- **`subscription_settings` = baris tunggal**: harga membership PRO, harga coret, dan QRIS pembayaran sengaja tidak jadi konstanta di kode supaya admin bisa mengubahnya tanpa deploy. Harga di-snapshot ke `subscriptions.amount` (dan `partner_subscriptions.amount`) saat pengajuan dibuat (lihat 5.7).
- **Default trial ada di level database (tabel `brands`)**: `trial_started_at DEFAULT now()` dan `trial_ends_at DEFAULT now() + interval '30 days'` — semua jalur pembuatan brand otomatis kebagian trial. Kolom brand/trial lama di `users` dibuang di migrasi `0020_drop_users_brand_columns.sql`. Skrip `scripts/backfill-brands.ts` dan `scripts/backfill-trial.ts` masih ada di repo sebagai sisa migrasi (tidak punya alias npm; dijalankan manual lewat `tsx`) dan sudah tidak relevan untuk operasi normal.
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
- **Neon = produksi, dan migrasi ke sana butuh izin dulu.** Lihat blok "⚠️ ATURAN PRODUKSI" di atas. Catatan historis `0006_timestamps_to_timestamptz`: saat insiden itu ditulis, migrasinya sudah ter-apply di lokal (`jastip_dev`) **dan** di Neon (`neondb`), sedangkan perubahan kode pendampingnya (`src/db/schema.ts` → `withTimezone: true`, `src/lib/timezone.ts`, pemakaian `timeZone: APP_TIME_ZONE`) belum di-deploy. Kode itu kini sudah ada di repo; status deploy produksi terkini tidak bisa dipastikan dari repo — cek dulu sebelum mengandalkannya.
- **Daftar migrasi** (`drizzle/`, 0000–0031) menurut tema: `0000`–`0001` skema awal; `0002` `users.is_admin`; `0003` alamat customer; `0004` `events.is_active`; `0005` `subscription_settings.qris_string`; `0006` timestamp → timestamptz; `0007` waktu avatar; `0008` `events.hide_fee`; `0009` verifikasi email; `0010` bukti transfer di Blobs (`payment_proof_stored`); `0011`–`0013` **brand** (kolom brand ditambah → diperketat → tim/undangan); `0014`–`0018` **kalender event** (event, detail, banner Blobs, online/tanggal selesai, partisipasi + `brands.wa_number`); `0019` harga coret langganan; `0020` buang kolom brand lama di `users`; `0021`–`0028` **partner** (akun, produk, tautan ke event, produk per event, katalog PDF, reset sandi, `disabled_at`, logo/katalog URL); `0029` varian & paket partner; `0030` langganan partner; `0031` `catalog_url` per event kalender. File baru selalu lewat `db:generate` (jangan menimpa yang lama).

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

Aturan yang sama dipakai **import data pesanan dari Excel/CSV** (§4.3.2) untuk baris
yang kolom `fee`-nya **kosong**; kalau kolom `fee` terisi, nilainya dipakai apa adanya. Karena
di import tidak ada yang bisa mengisi manual, harga di luar semua tier
(tidak ketemu) atau event yang belum punya aturan fee menghasilkan **fee 0**.

### Logika dashboard keuangan

- **Uang masuk** = `SUM(paidAmount)` dari seluruh orders milik **brand** (termasuk DP).
- **Outstanding / Belum bayar** = `SUM(MAX(total_tagihan - paidAmount, 0))` per order.
- **Total modal keluar** = `SUM(originalPrice × qty)` dari items yang order-nya berstatus `paid` atau `shipped`.
- **Untung bersih** = `SUM(fee × qty)` dari items yang order-nya berstatus `paid` atau `shipped`.
- **Pendapatan bulanan** (grafik) = `SUM((originalPrice + fee) × qty)` per bulan (bulan dihitung di zona `Asia/Jakarta`), hanya dari orders berstatus `paid` atau `shipped`.
- Status `shipped` diperlakukan setara `paid` untuk kalkulasi keuangan — menandai pesanan yang sudah dibayar dan barangnya sudah dikirim ke pelanggan.
- Event yang **nonaktif tetap ikut dihitung** di semua angka di atas: nonaktif cuma menyembunyikan event dari daftar event aktif, bukan mengeluarkan catatan uangnya.
- Semua query difilter `events.brand_id`. HPP paket partner (`items.hpp`) **tidak** ikut dalam rumus-rumus di atas; "Total modal keluar" tetap memakai `originalPrice × qty`.

## 8. Struktur File Utama

```
src/
├── components/           # Komponen UI reusable (±50 file; yang utama dikelompokkan)
│   ├── # Member (jastiper)
│   │   AddOrderSheet.tsx, PartnerBundleSheet.tsx, ImportOrdersModal.tsx, BottomNav.tsx,
│   │   CustomerFormModal.tsx, FeeRuleForm.tsx, MessageTemplateForm.tsx, PaymentInfoCard.tsx,
│   │   PaymentMethodModal.tsx, EditEventModal.tsx, EditProfileModal.tsx, ChangePasswordModal.tsx,
│   │   TeamSection.tsx, VerifyEmailBanner.tsx, UserAvatar.tsx, ThemeToggle.tsx, NewBadge.tsx,
│   │   PaymentProofViewer.tsx, InvoiceBrandMark.tsx, PageSkeleton.tsx
│   ├── # Langganan & PRO
│   │   ProBadge.tsx, ProLockPrompt.tsx, SubmitSubscriptionModal.tsx (QRIS dinamis),
│   │   ReviewSubscriptionModal.tsx, UpdateQrisModal.tsx (baca QR dengan jsqr), PartnerSubscriptionCard.tsx
│   ├── # Kalender
│   │   EventListCard.tsx, EventFilterSheet.tsx, EventDescription.tsx, JoinEventSheet.tsx,
│   │   CalendarEventForm.tsx, CalendarEventParticipants.tsx, PartnerShowcase.tsx
│   ├── # Admin: AdminBottomNav.tsx, AdminSidebar.tsx, AdminTopbar.tsx, admin-nav-items.ts (ADMIN_TABS)
│   ├── # Partner Portal: PartnerBottomNav.tsx, PartnerSidebar.tsx, PartnerTopbar.tsx, partner-nav-items.ts (PARTNER_TABS),
│   │   PartnerFormModal.tsx, PartnerEventForm.tsx, PartnerEventStatusBadge.tsx, PartnerProductForm.tsx,
│   │   PartnerProductPicker.tsx, PartnerVariantEditor.tsx, PartnerRuleForm.tsx, PartnerProductRuleCard.tsx,
│   │   PartnerLogo.tsx
│   └── ui/                    # Primitif: Switch, ConfirmModal, DpAmountModal, NumberInput, RupiahInput, Pagination, Toast
├── db/
│   ├── index.ts               # Koneksi Drizzle + pg
│   └── schema.ts              # Definisi semua tabel & relasi (brands, users, subscriptions, calendar_event, partner_*, dst.)
├── lib/                  # Server functions (createServerFn) + modul murni (±200 file; dikelompokkan per tema)
│   │   # Konvensi: `*-functions.ts` = server function, `*-queries.ts` = query DB (server-only),
│   │   # file lain = modul murni (tanpa db) yang dites `*.test.ts` (59 file tes, semuanya di lib/).
│   ├── # Auth, akun & brand
│   │   auth.ts (sesi), auth-functions.ts, google-auth.ts, password-reset-*.ts, email-verification-*.ts,
│   │   email-verified.ts (requireVerifiedEmail), mailer.ts (console/resend/smtp), app-url.ts,
│   │   brand.ts, brand-queries.ts, brand-permissions.ts (matriks owner/admin), team-functions.ts,
│   │   team-queries.ts, team-rules.ts, invitation-*.ts, avatar-*.ts, storage.ts (Netlify Blobs)
│   ├── # Langganan, entitlement & pembayaran
│   │   subscription.ts (aturan trial/FREE/PRO, murni), entitlements.ts (gerbang PRO server),
│   │   subscription-functions.ts / -queries.ts / -settings-queries.ts / -proof-*.ts,
│   │   payment-methods-functions.ts, payment-proof*.ts, qris.ts + qris-display.ts (QRIS dinamis),
│   │   price-discount.ts (harga coret)
│   ├── # Event, pesanan & keuangan
│   │   events-functions.ts, orders-functions.ts, order-totals.ts, order-merge.ts, order-import*.ts,
│   │   order-export.ts, order-sheet-*.ts, order-suggestions-functions.ts, item-bundle.ts,
│   │   customers-*.ts, customer-matching.ts (cocok via no. HP), customer-suggestions-functions.ts,
│   │   fee-rules-functions.ts, fee-suggestions*.ts, fee-tier-validation.ts, finance-functions.ts,
│   │   message-template*.ts, format.ts, timezone.ts, pagination.ts, linkify.ts
│   ├── # Kalender
│   │   calendar.ts, calendar-events-functions.ts, calendar-events-admin-functions.ts, calendar-event-input.ts,
│   │   calendar-banner*.ts, calendar-join*.ts, join-disclosure.ts
│   ├── # Admin: admin.ts (requireAdminUser), admin-functions.ts, admin-queries.ts,
│   │   admin-partner-subscription-functions.ts, partner-admin-queries.ts
│   ├── # Partner Portal: partner-*.ts (auth, functions, queries, rules, mail, entitlement, pricing,
│   │   bundle-build/-functions/-lock, catalog/dashboard/event/picklist/product/profile/variant rules,
│   │   subscription, showcase, password-reset-*)
│   └── # UI/infra: back-to-close.ts (useBackToClose), theme.ts, new-feature.ts, error-message.ts,
│       client-bundle-safety.test.ts (guard `db`/`pg` tidak bocor ke bundle client)
├── routes/
│   ├── __root.tsx             # Root layout (theme init, QueryClient provider)
│   ├── _app.tsx               # Auth-protected layout (session check + BottomNav)
│   ├── _app/
│   │   ├── index.tsx          # Beranda
│   │   ├── keuangan.tsx       # Dashboard keuangan
│   │   ├── events.$eventId.tsx  # Detail event (accordion customer + checklist barang + Pakai paket)
│   │   ├── events.new.tsx     # Form buat event baru
│   │   ├── invoice.$eventId.$orderId.tsx  # Invoice internal (auth)
│   │   ├── kalender/
│   │   │   ├── index.tsx      # Tab Event: daftar kalender + filter
│   │   │   └── $eventId.tsx   # Detail event kalender + Ikut Event
│   │   ├── pesanan/
│   │   │   └── new.tsx        # Pemilih event aktif → /events/:id?addOrder=true
│   │   └── profil/
│   │       ├── index.tsx      # Halaman profil
│   │       ├── langganan.tsx  # Paket & Langganan (status trial/FREE/PRO, pengajuan, riwayat)
│   │       ├── pembayaran.tsx # Metode pembayaran (owner)
│   │       ├── tim.tsx        # Kelola tim / undangan admin brand (owner)
│   │       ├── template-chat.tsx  # Template Chat WA (dulu modal)
│   │       ├── customers/index.tsx
│   │       ├── fee-rules/index.tsx
│   │       ├── fee-rules/new.tsx
│   │       └── fee-rules/$feeRuleId.tsx
│   ├── admin.tsx              # Layout admin (guard is_admin + nav admin, header identitas)
│   ├── admin/
│   │   ├── index.tsx          # Dashboard admin (metrik, verifikasi pengajuan)
│   │   ├── customers.tsx      # Daftar semua brand (plan, aktivitas, revenue, hapus permanen)
│   │   ├── event/{index,new,$eventId}.tsx  # Event kalender + peserta
│   │   ├── partner.tsx        # Akun partner
│   │   ├── langganan-partner.tsx  # Verifikasi langganan PRO partner
│   │   └── pengaturan.tsx     # Pengaturan pembayaran PRO (QRIS + harga/harga coret) + tombol Keluar
│   ├── partner.tsx            # Layout Partner Portal (guard sesi partner)
│   ├── partner/
│   │   ├── index.tsx          # Beranda partner (metrik)
│   │   ├── katalog/{index,baru,$id}.tsx   # Produk + varian
│   │   ├── paket/{index,baru,$id}.tsx     # Aturan paket (PRO)
│   │   ├── event/{index,baru,$id,ubah.$id,produk.$id,rekap.$id}.tsx
│   │   └── profil.tsx
│   ├── api/                   # Endpoint non-UI (lihat 8.1)
│   ├── login.tsx
│   ├── register.tsx
│   ├── lupa-sandi.tsx
│   ├── reset-sandi.$token.tsx
│   ├── reset-sandi-partner.$token.tsx
│   ├── verifikasi-email.$token.tsx
│   ├── undangan.$token.tsx            # Terima undangan admin brand
│   ├── undangan-partner.$token.tsx    # Terima undangan partner (buat kata sandi)
│   └── tagihan.$eventId.$orderId.tsx  # Invoice publik (tanpa auth)
└── styles.css                 # CSS variables + Tailwind directives
```

**Konvensi penamaan & batas server/client** (ini yang bikin app-nya tidak rusak saat build):

- Server function (`createServerFn`) tinggal di file `*-functions.ts`. File ini di-import langsung oleh halaman/komponen client, jadi **query `db` tidak boleh ditulis di level modul** — TanStack Start cuma membuang import yang dipakai di dalam handler, sehingga import `src/db` ikut ke bundle browser (`drizzle-orm/node-postgres` → `pg` → `events`) dan app-nya mati dengan error `Cannot access events.EventEmitter in client code`.
- Query yang butuh `db` ditaruh di file `*-queries.ts` (server-only, tidak pernah di-import client): `admin-queries.ts`, `customers-queries.ts`, `subscription-queries.ts`, `subscription-settings-queries.ts`. Urutannya: halaman → `*-functions.ts` (pagar auth/entitlement + validasi zod) → `*-queries.ts` (query murni).
- Aturan di atas dijaga otomatis oleh `src/lib/client-bundle-safety.test.ts`: satu test menolak `export function` biasa di file `*-functions.ts`, satu test lagi menolak halaman/komponen yang meng-import `src/db`. Jalankan `npm test` setelah menambah server function baru.
- Aturan langganan/trial/PRO yang murni (tanpa `db`) tinggal di `subscription.ts`, pagar admin di `admin.ts`, pagar PRO di `entitlements.ts` — supaya tidak ada pengecekan plan/admin yang ditulis ulang di tempat lain.
- Library yang **khusus browser** di-`import()` dinamis di dalam handler-nya, bukan di-import di level modul, supaya tidak ikut bundle awal dan tidak pernah jalan saat SSR — contohnya `read-excel-file/browser` (baca file import) dan `xlsx`/SheetJS (bikin file template) di `ImportOrdersModal.tsx` (file-nya di-parse/dibuat di client, server cuma menerima hasil parse-nya).

### 8.1 Penyimpanan file (Netlify Blobs) & endpoint `/api`

Semua akses Blobs lewat `src/lib/storage.ts` (hanya boleh dipanggil dari handler server function dan route `src/routes/api/*`; kalau nanti pindah ke S3-compatible cukup tulis ulang file ini). Kolom DB hanya menandai ada-tidaknya file (`*_updated_at` / `*_stored`) sekaligus jadi cache-buster `?v=`.

| Store Blobs             | Key           | Penanda di DB                                | Endpoint                               | Akses                                         |
| ----------------------- | ------------- | -------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `avatars`               | `brand.id`    | `brands.avatar_updated_at`                   | `GET /api/avatar/:brandId`             | Publik                                        |
| `calendar-banners`      | id event      | `calendar_event.banner_updated_at`           | `GET /api/event-banner/:eventId`       | Publik                                        |
| `partner-logos`         | id partner    | `partners.logo_updated_at`                   | `GET /api/partner-logo/:partnerId`     | Publik                                        |
| `partner-product-photos`| id produk     | `partner_products.photo_updated_at`          | `GET /api/partner-product-photo/:id`   | Publik                                        |
| `payment-proofs`        | id pengajuan  | `subscriptions.payment_proof_stored` / `partner_subscriptions.payment_proof_stored` | `GET /api/subscription-proof/:id`, `GET /api/partner-subscription-proof/:id` | Login; bukti brand hanya untuk pemilik brand/admin ALAKA (`subscription-proof-access.ts`); bukti partner hanya admin ALAKA. `Cache-Control: private, no-store` |
| `partner-catalog-pdfs`  | id partner    | `partners.catalog_pdf_*` (deprecated)        | —                                      | Tidak dipakai lagi (dibersihkan saat partner dihapus) |

Endpoint publik memakai `Cache-Control` ber-versi (`?v=` → `max-age=31536000, immutable`; tanpa `?v=` atau 404 → `max-age=60`), id wajib UUID, dan `X-Content-Type-Options: nosniff`. Tipe & ukuran selalu divalidasi ulang di server (magic bytes), bukan dipercaya dari client. Batas ukuran: foto brand & logo & foto produk ≤ 100 KB, banner ≤ 300 KB, bukti transfer ≤ 1 MB.

Route auth Google: `GET /api/auth/google` (mulai OAuth) dan `GET /api/auth/google/callback`.

### 8.2 Perintah & skrip

- `pnpm dev` (port 3000), `pnpm build` (`vite build` + `scripts/build-sw.mjs` yang menyuntik manifest ke service worker `scripts/sw-src.js`), `pnpm preview`, `pnpm lint`, `pnpm check` (prettier), `pnpm format`, `pnpm test` (`tsx --test src/**/*.test.ts`; sekarang 59 file tes, semuanya di `src/lib/` — tes di folder lain tidak akan terjangkau glob tanpa tanda kutip), `pnpm generate-routes`.
- Database: `db:generate`, `db:migrate`, `db:migrate:neon` (⚠ produksi, lihat 7.1), `db:push` (jangan — lihat 7.1), `db:pull`, `db:studio` / `db:studio:neon`, `db:baseline`, `db:seed-dummy`, `db:seed-calendar` / `db:seed-calendar:neon`.
- Skrip di `scripts/` tanpa alias npm (jalankan lewat `tsx`, sisa migrasi): `backfill-brands.ts`, `backfill-trial.ts`, `backfill-paid-amount.ts`, `migrate-payment-methods.ts`.
- **PWA**: `vite-plugin-pwa` (`registerType: 'autoUpdate'`) + service worker custom (Workbox `injectManifest`). Hanya **precache aset statis** (js/css/font/gambar/webmanifest, ≤ 4 MB); navigasi selalu `NetworkOnly`, jadi halaman **tidak** bisa dibuka offline. `dev-dist/` adalah keluaran mode dev (artefak generate).

## 9. Status Rencana & Di Luar Cakupan

**Sudah ada** (dulu tercatat sebagai next phase): verifikasi email (4.1), export data pesanan (4.3.3), import Excel/CSV (4.3.2), pengajuan PRO dari dalam aplikasi + panel verifikasi admin (4.12, 4.13, 5.6), tim/admin brand (4.16), Kalender Event + Ikut Event (4.17), Partner Portal (4.21). Tab **Pesanan** global **tidak jadi dibuat** — slotnya dipakai tab Event (4.11).

**Belum ada / belum selesai:**

- **Penyempurnaan alur PRO**: job yang menandai baris `subscriptions` / `partner_subscriptions` jadi `expired` saat `ends_at` lewat (sekarang masa habis hanya dideteksi dari `ends_at`), pengingat perpanjangan, notifikasi email saat pengajuan disetujui/ditolak, serta tindakan admin lanjutan (beri/cabut PRO manual tanpa pengajuan, ubah durasi per brand).
- **Selaraskan klaim paket PRO dengan kode**: daftar fitur PRO di halaman langganan (4.12) menyebut autocomplete customer, foto brand, dan admin tim, padahal yang digerbang server hanya `billing` dan `payment_methods` (5.2). Batas admin tim saat ini 1 per brand untuk semua paket (`getMaxAdmins()`), belum dikaitkan paket.
- **Selaraskan privasi rekap partner** dengan teks keterbukaan di sheet Ikut Event (4.21.6).
- **Memakai HPP paket partner** (`items.hpp`) di laporan: sekarang hanya disimpan; belum ada laporan untung/rugi per paket untuk jastiper (4.4.1).
- **"Ingat saya"** di halaman login belum berpengaruh (sesi selalu 30 hari).
- **Pagination** untuk daftar jastiper/admin yang besar (4.22).
- Reminder otomatis ke pelanggan yang belum lunas (WhatsApp API / bot).
- Payment gateway (pembayaran online) — masih manual/transfer.
- Aplikasi mobile native — web/PWA saja; PWA belum mendukung offline (8.2).
- **Master Control & Activity Logs**: tabel `activity_logs` sudah ada di DB dan menu-nya ada di kode tetapi disembunyikan (`FEATURES.advancedMenu = false`, 4.8.2); belum ada UI maupun kode yang menulis ke tabel itu — karena itu metrik "Active Users" di dashboard admin dihitung dari `orders.updated_at`.
- **Notifikasi push**: paket `web-push` terpasang, tetapi belum ada kode yang memakainya (tanpa `pushManager`/`showNotification`/route push); service worker hanya precache aset statis.
- Stok & pre-order varian partner: kolom `track_stock`, `stock_qty`, `allow_preorder` sudah ada di `partner_variants`, belum dipakai.
