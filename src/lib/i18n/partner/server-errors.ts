import type { PartnerLocale } from '../../partner-locale'

/**
 * Terjemahan pesan error (dari server function maupun validasi client) untuk
 * Partner Portal berbahasa Inggris.
 *
 * Server tetap melempar pesan berbahasa Indonesia; terjemahan dilakukan di
 * client (lihat `src/start.ts` dan `usePartnerI18n().errorMessage`). Pesan
 * yang tidak dikenal dibiarkan apa adanya, jadi aman menambah pesan baru di
 * server sebelum terjemahannya ditambahkan di sini.
 *
 * Kunci = teks Indonesia persis seperti di server. Pesan berisi angka/nama
 * memakai `PATTERNS`.
 */
const EXACT: Record<string, string> = {
  // Umum & sesi
  'Belum login sebagai partner': 'You are not logged in as a partner',
  'Event tidak ditemukan': 'Event not found',
  'Event tidak ditemukan.': 'Event not found.',
  'Produk tidak ditemukan': 'Product not found',
  'Partner tidak ditemukan': 'Partner not found',
  'Partner tidak ditemukan.': 'Partner not found.',
  'Jastiper tidak ditemukan': 'Jastiper not found',
  'Jastiper tidak ikut event ini': 'This jastiper has not joined this event',
  'Barang tidak ditemukan': 'Item not found',
  'Barang tidak ditemukan.': 'Item not found.',
  'Barang ini bukan paket': 'This item is not a bundle',
  'Submit tidak ditemukan': 'Submission not found',
  'Submit tidak ditemukan.': 'Submission not found.',
  'Aturan tidak ditemukan': 'Rule not found',
  'Tagihan tidak ditemukan': 'Invoice not found',
  'Tagihan tidak ditemukan.': 'Invoice not found.',
  'Ada produk yang tidak ditemukan': 'Some products were not found',
  'Ada produk yang bukan milik partner ini.':
    'Some products do not belong to this partner.',
  'Ada aturan paket yang bukan milik partner ini.':
    'Some bundle rules do not belong to this partner.',
  'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.':
    'Too many requests. Try again in a few minutes.',
  'Akun partner ini dinonaktifkan. Hubungi admin ALAKA.':
    'This partner account has been disabled. Contact the ALAKA admin.',

  // Event & slot
  'Nama event wajib diisi': 'Event name is required',
  'Nama event terlalu panjang': 'Event name is too long',
  'Lokasi wajib diisi': 'Location is required',
  'Tanggal tidak valid': 'Invalid date',
  'Tanggal selesai tidak valid': 'Invalid end date',
  'Tanggal selesai tidak boleh sebelum tanggal mulai':
    'End date cannot be earlier than the start date',
  'Nama brand terlalu panjang': 'Brand name is too long',
  'Waktu buka slot tidak valid.': 'Invalid slot opening time.',
  'Waktu tutup slot tidak valid.': 'Invalid slot closing time.',
  'Isi waktu buka dan waktu tutup slot, atau kosongkan keduanya.':
    'Fill in both the slot opening and closing times, or leave both empty.',
  'Waktu tutup slot harus setelah waktu buka.':
    'The slot closing time must be after the opening time.',
  'Sudah ada jastiper yang mengirim pesanan, jadi slot tidak bisa dimatikan.':
    'A jastiper has already sent orders, so the slot cannot be turned off.',
  'Sudah ada pesanan yang dikirim, jadi waktu tutup hanya boleh diperpanjang.':
    'Orders have already been sent, so the closing time can only be extended.',
  'Slot pemesanan belum dibuka oleh partner.':
    'The ordering slot has not been opened by the partner.',
  'Slot pemesanan sudah ditutup.': 'The ordering slot is already closed.',
  'Event ini tidak terhubung ke event partner.':
    'This event is not linked to a partner event.',

  // Banner, foto, gambar
  'File yang dipilih bukan gambar.': 'The selected file is not an image.',
  'Gambar terlalu besar (maksimal 15 MB).':
    'The image is too large (max. 15 MB).',
  'Foto terlalu besar (maksimal 15 MB).':
    'The photo is too large (max. 15 MB).',
  'Gambar tidak valid.': 'Invalid image.',
  'Foto tidak valid.': 'Invalid photo.',
  'Browser tidak mendukung pengolahan gambar.':
    'Your browser does not support image processing.',
  'Browser tidak mendukung pengolahan foto.':
    'Your browser does not support photo processing.',
  'Gambar tidak bisa diperkecil. Coba gambar lain.':
    'The image could not be resized. Try another image.',
  'Gambar tidak bisa diperkecil. Coba screenshot ulang.':
    'The image could not be resized. Try taking the screenshot again.',
  'Foto tidak bisa diperkecil. Coba foto lain.':
    'The photo could not be resized. Try another photo.',
  'Foto tidak bisa dibaca. Coba foto lain (JPG, PNG, atau WebP).':
    'The photo could not be read. Try another photo (JPG, PNG, or WebP).',
  'Gagal membaca foto': 'Could not read the photo',
  'Foto terlalu besar': 'The photo is too large',
  'Terlalu banyak foto variasi': 'Too many variation photos',
  'Format foto tidak valid. Gunakan foto WebP atau JPEG.':
    'Invalid photo format. Use a WebP or JPEG photo.',
  'Foto terlalu besar. Maksimal 100 KB setelah diperkecil.':
    'The photo is too large. Max. 100 KB after resizing.',
  'Foto rusak. Coba pilih foto lain.':
    'The photo is corrupted. Try another photo.',
  'Isi file bukan gambar WebP/JPEG yang valid.':
    'The file is not a valid WebP/JPEG image.',
  'Format banner tidak valid. Gunakan gambar WebP atau JPEG.':
    'Invalid banner format. Use a WebP or JPEG image.',
  'Banner terlalu besar. Maksimal 300 KB setelah diperkecil.':
    'The banner is too large. Max. 300 KB after resizing.',
  'Banner rusak. Coba pilih gambar lain.':
    'The banner is corrupted. Try another image.',

  // Link katalog
  'Link terlalu panjang': 'The link is too long',
  'Link tidak valid. Awali dengan https://':
    'Invalid link. Start with https://',
  'Link harus diawali https://': 'The link must start with https://',
  'Link tidak boleh memuat nama pengguna atau kata sandi':
    'The link must not contain a username or password',
  'Gunakan link dari situs, bukan alamat lokal atau IP':
    'Use a link to a website, not a local or IP address',

  // Produk & varian
  'Nama produk wajib diisi': 'Product name is required',
  'Harga harus bilangan bulat': 'Price must be a whole number',
  'Harga tidak boleh negatif': 'Price cannot be negative',
  'Harga terlalu besar': 'Price is too large',
  'Isi harga produk.': 'Enter the product price.',
  'Pengecekan stok otomatis sedang berjalan. Simpan stok setelah pengecekan selesai atau dihentikan.':
    'The automatic stock check is running. Save stock after the check finishes or is stopped.',
  'Setiap varian harus punya ukuran yang terdaftar.':
    'Every variant must have a registered size.',
  'Produk ini tidak punya grup ukuran.': 'This product has no size group.',
  'Setiap varian harus punya variasi yang terdaftar.':
    'Every variant must have a registered variation.',
  'Produk ini tidak punya grup variasi.':
    'This product has no variation group.',
  'Harga varian tidak valid.': 'Invalid variant price.',
  'Stok varian harus bilangan bulat, minimal 0.':
    'Variant stock must be a whole number, at least 0.',
  'Kombinasi varian dobel.': 'Duplicate variant combination.',

  // Aturan paket
  'Nama aturan wajib diisi': 'Rule name is required',
  'Jumlah pcs minimal 1': 'Pcs must be at least 1',
  'Harga paket tidak boleh negatif': 'Bundle price cannot be negative',
  'Pilih minimal satu produk': 'Choose at least one product',
  'Ada produk dengan ukuran yang sama di aturan paket lain.':
    'Some products have the same size in another bundle rule.',
  'Paket harus berisi minimal satu barang.':
    'A bundle must contain at least one item.',
  'Jumlah paket harus bilangan bulat minimal 1.':
    'Bundle quantity must be a whole number of at least 1.',
  'Harga jual dan fee tidak boleh negatif.':
    'Selling price and fee cannot be negative.',
  'Qty harus bilangan bulat minimal 1.':
    'Qty must be a whole number of at least 1.',
  'Nominal tidak boleh negatif.': 'The amount cannot be negative.',

  // Profil
  'Kata sandi lama wajib diisi': 'Current password is required',
  'Kata sandi belum dibuat': 'No password has been created yet',
  'Kata sandi lama salah': 'The current password is incorrect',
  'Nama bank wajib diisi': 'Bank name is required',
  'Nomor rekening wajib diisi': 'Account number is required',
  'Nama pemilik rekening wajib diisi': 'Account holder name is required',
  'Nomor rekening hanya boleh berisi angka':
    'The account number may only contain digits',
  'Nama partner wajib diisi': 'Partner name is required',
  'Nama partner wajib diisi.': 'Partner name is required.',
  'Nomor WhatsApp tidak valid': 'Invalid WhatsApp number',

  // Saldo & top up
  'Pilih nominal top up yang tersedia.':
    'Choose one of the available top up amounts.',
  'Ukuran bukti transfer maksimal 1MB': 'The transfer proof can be at most 1MB',
  'Format bukti transfer harus PNG, JPEG, atau WEBP':
    'The transfer proof must be PNG, JPEG, or WEBP',
  'Top up tidak ditemukan.': 'Top up not found.',
  'Top up ini sudah disetujui.': 'This top up has already been approved.',
  'Top up ini sudah ditolak.': 'This top up has already been rejected.',

  // Cek pesanan
  'Submit ini sudah dicek.': 'This submission has already been checked.',
  'Ada barang yang belum dicek.': 'Some items have not been checked yet.',
  'Hanya barang yang sudah disetujui yang bisa dibatalkan.':
    'Only approved items can be cancelled.',
  'Jumlah baris harus bilangan bulat lebih dari 0.':
    'Row quantity must be a whole number greater than 0.',
  'Jumlah yang disetujui harus bilangan bulat, minimal 0.':
    'The approved quantity must be a whole number, at least 0.',
  'Jumlah yang disetujui tidak boleh melebihi yang diajukan.':
    'The approved quantity cannot exceed the requested quantity.',
  'Barang ini sudah ditagih. Batalkan tagihannya dulu.':
    'This item has already been invoiced. Cancel the invoice first.',

  // Tagihan
  'Isi rekening pembayaran di halaman Profil dulu sebelum menagih jastiper.':
    'Fill in your payment account on the Profile page before invoicing jastipers.',
  'Pilih minimal satu submit.': 'Choose at least one submission.',
  'Submit tidak ditemukan di event ini.': 'Submission not found in this event.',
  'Satu tagihan hanya untuk satu jastiper.':
    'One invoice can only be for one jastiper.',
  'Tagihan tidak valid.': 'Invalid invoice.',
  'Tagihan tidak bisa dibatalkan karena jastiper sudah mengaku bayar. Tolak bukti bayarnya dulu.':
    'The invoice cannot be cancelled because the jastiper says they have paid. Reject the payment proof first.',
  'Tagihan sudah lunas dan tidak bisa dibatalkan.':
    'The invoice is already paid and cannot be cancelled.',
  'Tagihan sudah dibatalkan.': 'The invoice has already been cancelled.',
  'Pembayaran sudah dikirim dan menunggu dicek partner.':
    'Payment has been sent and is waiting for the partner to check it.',
  'Tagihan ini sudah lunas.': 'This invoice is already paid.',
  'Tagihan ini sudah dibatalkan.': 'This invoice has already been cancelled.',
  'Jastiper belum mengirim bukti bayar.':
    'The jastiper has not sent payment proof yet.',
  'Aksi ini tidak bisa dilakukan pada tagihan ini.':
    'This action cannot be performed on this invoice.',
  'Cek dulu barang pengganti di submit ini sebelum menagih.':
    'Check the replacement items in this submission before invoicing.',
}

type Pattern = [RegExp, (...groups: Array<string>) => string]

const PATTERNS: Array<Pattern> = [
  [
    /^Submit ke-(\d+) belum dicek, jadi belum bisa ditagih\.$/,
    (n) =>
      `Submission #${n} has not been checked yet, so it cannot be invoiced.`,
  ],
  [
    /^Submit ke-(\d+) masih menunggu keputusan jastiper untuk isi paket yang ditolak \(diganti atau tidak\)\. Pilih "Tagih apa adanya" kalau barang itu tidak jadi diganti\.$/,
    (n) =>
      `Submission #${n} is still waiting for the jastiper's decision on rejected bundle contents (replace or not). Choose "Invoice as is" if those items will not be replaced.`,
  ],
  [
    /^Submit ke-(\d+) sudah ada di tagihan aktif\.$/,
    (n) => `Submission #${n} is already in an active invoice.`,
  ],
  [
    /^Submit ke-(\d+) tidak punya barang yang bisa ditagih\.$/,
    (n) => `Submission #${n} has no items that can be invoiced.`,
  ],
  [
    /^Waktu buka tidak boleh lebih lambat dari pesanan pertama yang sudah dikirim \((.+)\)\.$/,
    (time) =>
      `The opening time cannot be later than the first order already sent (${time}).`,
  ],
  [
    /^(.+) maksimal (\d+) karakter$/,
    (label, max) => `${translateLabel(label)} can be at most ${max} characters`,
  ],
  [
    /^Password minimal (\d+) karakter$/,
    (n) => `Password must be at least ${n} characters`,
  ],
  [
    /^Nomor rekening (\d+) sampai (\d+) digit$/,
    (min, max) => `Account number must be ${min} to ${max} digits`,
  ],
  [
    /^Pilih minimal satu ukuran untuk aturan (.+)\.$/,
    (rule) => `Choose at least one size for the ${rule} rule.`,
  ],
  [
    /^Pilih minimal satu ukuran untuk (.+)\.$/,
    (name) => `Choose at least one size for ${name}.`,
  ],
  [
    /^(.+) sudah ada di aturan paket lain dengan ukuran yang sama\.$/,
    (name) => `${name} is already in another bundle rule with the same size.`,
  ],
  [
    /^Produk (.+) sudah punya aturan dengan ukuran yang sama\.$/,
    (name) => `Product ${name} already has a rule with the same size.`,
  ],
  [
    /^(.+) tidak termasuk dalam aturan "(.+)"\.$/,
    (name, rule) => `${name} is not included in the "${rule}" rule.`,
  ],
  [/^Qty (.+) tidak valid\.$/, (name) => `Invalid qty for ${name}.`],
  [
    /^Paket "(.+)" harus berisi tepat (\d+) pcs, bukan (\d+)\.$/,
    (rule, want, got) =>
      `Bundle "${rule}" must contain exactly ${want} pcs, not ${got}.`,
  ],
  [
    /^Nilai (.+) yang sudah dipakai varian tidak bisa dihapus: (.+)\. Nonaktifkan varian itu dulu\.$/,
    (type, name) =>
      `${translateLabel(type)} values used by a variant cannot be removed: ${name}. Deactivate that variant first.`,
  ],
  [
    /^Nilai (.+) tidak boleh kosong\.$/,
    (label) => `${translateLabel(label)} values cannot be empty.`,
  ],
  [
    /^Nilai (.+) terlalu panjang\.$/,
    (label) => `${translateLabel(label)} value is too long.`,
  ],
  [
    /^Nilai (\S+) "(.+)" dobel\.$/,
    (label, name) =>
      `Duplicate ${translateLabel(label).toLowerCase()} value "${name}".`,
  ],
  [/^Nominal tidak valid: (.+)$/, (v) => `Invalid amount: ${v}`],
  [
    /^Stok tidak cukup: (.+)$/,
    (list) =>
      `Not enough stock: ${list.replace(
        /: stok tinggal (\d+), diminta (\d+)/g,
        ': $1 left in stock, $2 requested',
      )}`,
  ],
]

/** Label kolom yang muncul di dalam pesan dinamis. */
const LABELS: Record<string, string> = {
  Nama: 'Name',
  'Nama produk': 'Product name',
  'Kode produk': 'Product code',
  Kode: 'Code',
  Deskripsi: 'Description',
  'Nama bank': 'Bank name',
  'Nama pemilik rekening': 'Account holder name',
  'Nama partner': 'Partner name',
  ukuran: 'Size',
  Ukuran: 'Size',
  variasi: 'Variation',
  Variasi: 'Variation',
}

function translateLabel(label: string): string {
  return LABELS[label] ?? label
}

function translateOne(message: string): string {
  if (Object.hasOwn(EXACT, message)) return EXACT[message]
  for (const [pattern, render] of PATTERNS) {
    const match = pattern.exec(message)
    if (match) return render(...match.slice(1))
  }
  return message
}

/**
 * Terjemahkan satu pesan error ke bahasa partner. Bahasa Indonesia = apa
 * adanya. Pesan validasi zod (JSON berisi daftar issue) ikut diterjemahkan
 * per issue supaya `getErrorMessage` tetap bisa membacanya.
 */
export function translatePartnerMessage(
  message: string,
  locale: PartnerLocale,
): string {
  if (locale === 'id') return message
  const trimmed = message.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const issues = Array.isArray(parsed)
        ? parsed
        : (parsed as { issues?: unknown }).issues
      if (Array.isArray(issues)) {
        for (const issue of issues as Array<{ message?: unknown }>) {
          if (typeof issue.message === 'string') {
            issue.message = translateOne(issue.message)
          }
        }
        return JSON.stringify(parsed)
      }
    } catch {
      // Bukan JSON; terjemahkan sebagai teks biasa.
    }
  }
  return translateOne(message)
}

/** Untuk test: semua pesan Indonesia yang punya terjemahan persis. */
export const TRANSLATED_MESSAGES = Object.keys(EXACT)
