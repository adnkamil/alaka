/**
 * Import pesanan dari file Excel/CSV di halaman Detail Event.
 *
 * Alurnya: file → baris mentah → `buildImportPreview()` → pesanan per
 * pelanggan → dikirim ke server lewat `importOrders()`.
 *
 * Kolom yang dibaca (dicari dari NAMA header, jadi urutan kolom bebas):
 *
 *   No urut | Nama-no wa | item | harga
 *
 * - `No urut` cuma penomoran di file — tidak ikut disimpan. Nomor barisnya
 *   dipakai buat pesan error ("Baris 7: ..."), jadi nomornya sama dengan yang
 *   kelihatan di Excel.
 * - `Nama-no wa` isinya nama pelanggan + nomor WA dalam satu sel (mis.
 *   "Nia - 08123456789"); pemisahnya dideteksi otomatis. Kalau file malah
 *   memisahkan "Nama" dan "No WA" jadi dua kolom, itu juga didukung.
 * - `harga` = harga asli barang. Fee jastip TIDAK diambil dari file, tapi
 *   dihitung dari aturan fee milik event ini (`findFeeForPrice` — aturan yang
 *   sama dipakai form Tambah Pesanan). Kalau event belum punya aturan fee,
 *   atau harganya di luar semua tier, fee-nya **0** (bisa diedit nanti di
 *   pesanannya).
 *
 * Baris yang nama pelanggan / nama barang / harganya tidak bisa dibaca TIDAK
 * dilewati diam-diam: barisnya dicatat di `errors` dan UI menolak import
 * selama masih ada error, supaya tidak ada data yang hilang tanpa disadari.
 *
 * Modul ini juga menyiapkan **isi template Excel siap isi** yang dipakai tombol
 * "Download template" di modal import (`buildImportTemplateRows` — dipakai
 * `ImportOrdersModal` buat bikin file `.xlsx` lewat SheetJS). Contoh isinya 4
 * baris untuk 2 pelanggan, dan header-nya sengaja memakai nama kolom yang sama
 * seperti di atas — jadi file hasil unduhan pasti kebaca oleh `findImportHeader`.
 *
 * Modul ini SENGAJA murni (tanpa `db`, tanpa API browser, dan tanpa library
 * Excel) supaya aturannya bisa diuji tanpa database (`pnpm test`) — sama
 * seperti `order-merge.ts`.
 */

import { findFeeForPrice } from './fee-tier-validation'
import type { FeeTierInput } from './fee-tier-validation'
import { findMergeTarget } from './order-merge'
import type { MergeTargetOrder } from './order-merge'
import { summarizeItems } from './order-totals'

/** Batas aman sekali import, biar payload & transaksinya tidak kebangetan. */
export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_ORDERS = 500

/** Nama file template yang diunduh dari tombol "Download template". */
export const IMPORT_TEMPLATE_FILE_NAME = 'template-import-pesanan.xlsx'

/**
 * Header template — sengaja sama persis dengan nama kolom yang dikenali
 * pembaca (`classifyHeader`), biar file hasil unduhan langsung kebaca.
 */
export const IMPORT_TEMPLATE_HEADER = ['No urut', 'Nama-no wa', 'item', 'harga']

/**
 * Contoh isi template: **4 baris data untuk 2 pelanggan** (masing-masing 2
 * barang). Pelanggan pertama sengaja muncul di dua baris supaya kelihatan
 * bahwa baris dengan nama pelanggan sama digabung jadi satu tagihan.
 * `No urut` & `harga` ditulis sebagai angka (bukan teks) supaya Excel
 * memperlakukannya sebagai bilangan, bukan tulisan.
 */
export const IMPORT_TEMPLATE_ROWS: Array<Array<string | number>> = [
  [1, 'Nia - 08123456789', 'Kaos', 15000],
  [2, 'Nia - 08123456789', 'Sepatu', 250000],
  [3, 'Budi - 081298765432', 'Tas', 120000],
  [4, 'Budi - 081298765432', 'Topi', 45000],
]

export interface ImportPreviewItem {
  name: string
  originalPrice: number
  /** Hasil aturan fee event ini; 0 kalau tidak ada aturan / di luar tier. */
  fee: number
  qty: number
}

/** Satu pelanggan = satu pesanan (semua barisnya dikumpulkan jadi satu). */
export interface ImportOrderInput {
  customerName: string
  customerPhone: string | null
  items: Array<ImportPreviewItem>
}

export interface ImportPreviewOrder extends ImportOrderInput {
  subtotal: number
  feeTotal: number
  total: number
  /** Pelanggan ini sudah punya pesanan belum lunas → barangnya bakal digabung. */
  mergeIntoExisting: boolean
  /** Nomor baris file (1-based, sama seperti yang tampil di Excel). */
  rowNumbers: Array<number>
}

export interface ImportPreviewError {
  rowNumber: number
  message: string
}

export interface ImportPreview {
  /** Terisi kalau file-nya tidak bisa dipakai sama sekali (mis. header tidak ada). */
  fatalError: string | null
  orders: Array<ImportPreviewOrder>
  errors: Array<ImportPreviewError>
  /** Baris yang dilewati karena semua kolomnya kosong. */
  emptyRows: number
  /** Baris data yang berhasil dibaca (tidak termasuk baris error/kosong). */
  dataRows: number
}

export interface ImportPreviewOptions {
  /**
   * Pesanan yang sudah ada di event ini. Dipakai buat menandai pelanggan yang
   * barangnya bakal **digabung** ke pesanan lama, bukan bikin tagihan baru
   * (aturan gabungnya di `order-merge.ts`, sama seperti `createOrder`).
   */
  existingOrders?: Array<MergeTargetOrder>
}

/** Kolom yang berhasil dikenali dari baris header. */
interface ImportColumns {
  /** Kolom gabungan "Nama-no wa" (nama + nomor jadi satu sel). */
  customer: number | null
  name: number | null
  phone: number | null
  item: number
  price: number
}

interface ImportHeader {
  /** Index baris header di dalam file (0-based). */
  index: number
  columns: ImportColumns
}

const ITEM_HINTS = ['item', 'barang', 'produk']
const PRICE_HINTS = ['harga', 'price']
const PHONE_HINTS = ['wa', 'hp', 'telp', 'telepon', 'phone', 'nomor']

/** Isi sel dijadikan string; `null`/`undefined` jadi string kosong. */
function cellText(row: Array<unknown>, column: number | null) {
  if (column === null || column < 0) return ''
  const value = row[column]
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

/** "Nama-no wa" → "namanowa" (huruf kecil, tanpa spasi/tanda baca). */
function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function classifyHeader(normalized: string): keyof ImportColumns | null {
  if (!normalized) return null
  if (PRICE_HINTS.some((hint) => normalized.includes(hint))) return 'price'
  // "Nama Barang" itu kolom barang, bukan nama pelanggan — cek item dulu.
  if (ITEM_HINTS.some((hint) => normalized.includes(hint))) return 'item'

  const hasName = normalized.includes('nama')
  const hasPhone = PHONE_HINTS.some((hint) => normalized.includes(hint))
  if (hasName && hasPhone) return 'customer'
  if (hasName) return 'name'
  if (hasPhone) return 'phone'
  return null
}

/**
 * Cari baris header di `maxScan` baris teratas (file sering punya baris judul
 * dulu di atasnya). Header dianggap ketemu kalau ada kolom barang, kolom harga,
 * dan kolom nama pelanggan (gabungan atau terpisah).
 */
export function findImportHeader(
  rows: Array<Array<unknown>>,
  maxScan = 10,
): ImportHeader | null {
  const limit = Math.min(rows.length, maxScan)

  for (let index = 0; index < limit; index++) {
    const columns: ImportColumns = {
      customer: null,
      name: null,
      phone: null,
      item: -1,
      price: -1,
    }

    rows[index].forEach((cell, column) => {
      const kind = classifyHeader(normalizeHeader(cell))
      if (!kind) return
      if (kind === 'item') {
        if (columns.item === -1) columns.item = column
      } else if (kind === 'price') {
        if (columns.price === -1) columns.price = column
      } else if (kind === 'customer') {
        if (columns.customer === null) columns.customer = column
      } else if (kind === 'name') {
        if (columns.name === null) columns.name = column
      } else if (columns.phone === null) {
        columns.phone = column
      }
    })

    const hasCustomer = columns.customer !== null || columns.name !== null
    if (columns.item !== -1 && columns.price !== -1 && hasCustomer) {
      return { index, columns }
    }
  }

  return null
}

/** Bulatkan ke 2 desimal (skala kolom harga di DB) tanpa error floating. */
function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * Baca harga dari sel Excel/CSV jadi angka. Sel angka dari Excel sudah berupa
 * `number`; sel teks dibersihkan dulu dari "Rp", spasi, dan pemisah ribuan.
 *
 * Aturan pemisah (file jastip umumnya format Indonesia):
 * - Ada dua pemisah ("12.500,50") → yang paling belakang jadi desimal.
 * - Satu pemisah dengan 3 angka di belakang ("12.500" / "1,500") → pemisah
 *   ribuan, karena harga barang jastip jarang ditulis sampai 3 desimal.
 * - Selain itu ("12500.5" / "12,5") → desimal.
 *
 * `null` = tidak bisa dibaca (dipakai buat menandai baris error).
 */
export function parseImportMoney(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? roundMoney(value) : null
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null
  }

  let text = String(value)
    .replace(/rp/gi, '')
    .replace(/idr/gi, '')
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[^0-9.,]/g, '')
  if (!text) return null

  const hasDot = text.includes('.')
  const hasComma = text.includes(',')
  if (hasDot && hasComma) {
    // Pemisah paling belakang = desimal, sisanya ribuan.
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.'
    text = text.split(decimal === ',' ? '.' : ',').join('')
    text = text.replace(decimal, '.')
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ','
    const parts = text.split(separator)
    // Semua kelompok setelah yang pertama berisi 3 angka = pemisah ribuan.
    const thousands = parts.slice(1).every((part) => part.length === 3)
    text = thousands
      ? parts.join('')
      : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`
  }

  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return roundMoney(parsed)
}

/** "62 812-3456" / "+62812 3456" / "8123456" → "08123456". */
export function normalizePhoneNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('62')) return `0${digits.slice(2)}`
  if (digits.startsWith('8')) return `0${digits}`
  return digits
}

/** Bersihkan sisa pemisah setelah nomor WA dikeluarkan dari nama. */
function cleanCustomerName(value: string) {
  return value
    .replace(/[()[\]{}]/g, ' ')
    .replace(/^[\s,;:|/\\\-–—.]+/, '')
    .replace(/[\s,;:|/\\\-–—.]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Pola nomor WA: dengan kode negara, awalan 0, atau langsung 8xxx. */
const PHONE_PATTERNS = [
  /\+?62[\s.-]?8[\d\s().-]*\d/,
  /0\d[\d\s().-]*\d/,
  /\b8\d[\d\s().-]*\d/,
]

/**
 * Pisahkan sel "Nama-no wa" jadi nama + nomor (nomor `null` kalau tidak ada).
 * Panjang nomor yang wajar adalah 8–15 digit; kalau di luar itu (mis. teksnya
 * cuma angka pendek), seluruh sel dianggap nama pelanggan.
 */
export function splitCustomerNameAndPhone(raw: string): {
  name: string
  phone: string | null
} {
  const value = String(raw).replace(/\s+/g, ' ').trim()
  if (!value) return { name: '', phone: null }

  for (const pattern of PHONE_PATTERNS) {
    const match = value.match(pattern)
    if (!match) continue

    const phone = normalizePhoneNumber(match[0])
    if (!phone || phone.length < 8 || phone.length > 15) continue

    // "8xxx" tanpa 0/62 cuma dianggap nomor kalau panjangnya wajar.
    const isBare = !/^(\+?62|0)/.test(match[0].trim())
    if (isBare && phone.length < 10) continue

    const start = match.index ?? 0
    const name = cleanCustomerName(
      `${value.slice(0, start)} ${value.slice(start + match[0].length)}`,
    )
    return { name, phone }
  }

  return { name: cleanCustomerName(value), phone: null }
}

/**
 * Parser CSV seadanya (RFC 4180): dukung tanda kutip, pemisah di dalam kutip,
 * kutip ganda (`""` → `"`), baris CRLF, dan BOM dari Excel. Pemisah kolomnya
 * dideteksi otomatis karena Excel Indonesia biasanya bikin CSV dengan `;`.
 */
export function parseCsvRows(text: string): Array<Array<string>> {
  const clean = text.replace(/^\uFEFF/, '')
  const delimiter = detectCsvDelimiter(clean)

  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < clean.length; index++) {
    const char = clean[index]

    if (inQuotes) {
      if (char === '"') {
        if (clean[index + 1] === '"') {
          field += '"'
          index++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  row.push(field)
  rows.push(row)

  // Buang baris kosong di paling bawah (file biasanya diakhiri newline).
  const last = rows[rows.length - 1]
  if (last.every((cell) => cell.trim() === '')) rows.pop()

  return rows
}

/**
 * Isi template dalam bentuk array-of-arrays — tinggal diumpankan ke
 * `XLSX.utils.aoa_to_sheet()` di `ImportOrdersModal` buat bikin file `.xlsx`.
 *
 * Tetap murni (cuma data, tanpa library Excel) supaya isinya bisa diuji tanpa
 * database: hasilnya harus lolos `buildImportPreview` tanpa error.
 */
export function buildImportTemplateRows(): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    IMPORT_TEMPLATE_HEADER,
    ...IMPORT_TEMPLATE_ROWS,
  ]
  return rows
}

/**
 * Ubah baris mentah file jadi rencana import: satu pesanan per pelanggan
 * (semua barisnya dikumpulkan), fee tiap barang dihitung dari aturan fee event,
 * dan baris yang bermasalah dikumpulkan di `errors`.
 *
 * Fungsi ini tidak menyentuh database — hasilnya dipakai buat preview di UI dan
 * baru dikirim ke server setelah user menekan tombol import.
 */
export function buildImportPreview(
  rows: Array<Array<unknown>>,
  tiers: Array<FeeTierInput>,
  options: ImportPreviewOptions = {},
): ImportPreview {
  const header = findImportHeader(rows)
  if (!header) {
    return {
      fatalError:
        'Kolom file-nya tidak dikenali. Pastikan ada baris header berisi: No urut, Nama-no wa, item, harga.',
      orders: [],
      errors: [],
      emptyRows: 0,
      dataRows: 0,
    }
  }

  const { columns } = header
  const existingOrders = options.existingOrders ?? []
  const orders = new Map<string, ImportPreviewOrder>()
  const errors: Array<ImportPreviewError> = []
  let emptyRows = 0
  let dataRows = 0

  for (let index = header.index + 1; index < rows.length; index++) {
    const row = rows[index]
    // Nomor baris 1-based = sama dengan nomor baris yang tampil di Excel.
    const rowNumber = index + 1

    const customerRaw = cellText(row, columns.customer)
    const nameRaw = cellText(row, columns.name)
    const phoneRaw = cellText(row, columns.phone)
    const itemRaw = cellText(row, columns.item)
    const priceRaw = cellText(row, columns.price)

    // Baris kosong (mis. sisa format Excel) dilewati tanpa dianggap error.
    if (!customerRaw && !nameRaw && !phoneRaw && !itemRaw && !priceRaw) {
      emptyRows++
      continue
    }

    const split = splitCustomerNameAndPhone(customerRaw)
    const customerName = (split.name || nameRaw.trim())
      .replace(/\s{2,}/g, ' ')
      .trim()
    // Kolom "No WA" terpisah (kalau ada) yang dipakai; kalau tidak, dari sel
    // gabungan "Nama-no wa".
    const customerPhone =
      splitCustomerNameAndPhone(phoneRaw).phone ?? split.phone

    if (!customerName) {
      errors.push({ rowNumber, message: 'Nama pelanggan belum diisi' })
      continue
    }
    if (!itemRaw) {
      errors.push({ rowNumber, message: 'Nama barang belum diisi' })
      continue
    }

    const price = parseImportMoney(priceRaw)
    if (price === null) {
      errors.push({
        rowNumber,
        message: priceRaw
          ? `Harga "${priceRaw}" tidak bisa dibaca sebagai angka`
          : 'Harga belum diisi',
      })
      continue
    }

    // Kunci grup pakai nama huruf kecil — sama seperti aturan gabung pesanan
    // (`order-merge.ts`) yang mencocokkan pelanggan dari namanya.
    const key = customerName.toLowerCase()
    let order = orders.get(key)
    if (!order) {
      order = {
        customerName,
        customerPhone,
        items: [],
        subtotal: 0,
        feeTotal: 0,
        total: 0,
        mergeIntoExisting: Boolean(
          findMergeTarget(existingOrders, customerName),
        ),
        rowNumbers: [],
      }
      orders.set(key, order)
    }
    // Nomor WA dari baris pertama yang ada isinya yang dipakai.
    if (!order.customerPhone && customerPhone) {
      order.customerPhone = customerPhone
    }
    order.rowNumbers.push(rowNumber)

    const itemName = itemRaw.replace(/\s{2,}/g, ' ').trim()
    // Barang yang sama (nama + harga sama) di baris terpisah digabung jadi satu
    // baris dengan qty bertambah — totalnya identik, hasilnya lebih rapi.
    const sameLine = order.items.find(
      (item) =>
        item.name.toLowerCase() === itemName.toLowerCase() &&
        item.originalPrice === price,
    )
    if (sameLine) {
      sameLine.qty += 1
    } else {
      order.items.push({
        name: itemName,
        originalPrice: price,
        // Fee dari aturan fee jastip event ini; 0 kalau tidak ada aturan fee
        // atau harganya di luar semua tier.
        fee: findFeeForPrice(tiers, price) ?? 0,
        qty: 1,
      })
    }

    dataRows++
  }

  for (const order of orders.values()) {
    const summary = summarizeItems(order.items)
    order.subtotal = summary.subtotal
    order.feeTotal = summary.totalFee
    order.total = summary.total
  }

  const result: ImportPreview = {
    fatalError: null,
    orders: [...orders.values()],
    errors,
    emptyRows,
    dataRows,
  }

  if (dataRows > MAX_IMPORT_ROWS) {
    result.fatalError = `File-nya berisi ${dataRows} baris, melebihi batas ${MAX_IMPORT_ROWS} baris sekali import. Pecah jadi beberapa file.`
  } else if (result.orders.length > MAX_IMPORT_ORDERS) {
    result.fatalError = `File-nya berisi ${result.orders.length} pelanggan, melebihi batas ${MAX_IMPORT_ORDERS} pelanggan sekali import. Pecah jadi beberapa file.`
  } else if (result.orders.length === 0 && errors.length === 0) {
    result.fatalError = 'Tidak ada baris data yang bisa dibaca di file ini.'
  }

  return result
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text.split('\n', 1)[0] ?? ''
  const semicolons = (firstLine.match(/;/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  return semicolons > commas ? ';' : ','
}

/**
 * Baca file jadi baris-baris mentah.
 *
 * CSV dibaca modul ini sendiri (murni). Untuk `.xlsx`, `read-excel-file`
 * di-`import()` **dinamis** supaya:
 * 1. tidak ikut bundle awal (baru ke-load waktu user benar-benar import), dan
 * 2. tidak pernah jalan saat SSR — build `/browser`-nya khusus browser.
 *
 * Yang dipakai cuma sheet pertama (`readSheet`), karena data jastip biasanya
 * dikirim sebagai satu sheet.
 */
export async function readRowsFromFile(
  file: File,
): Promise<Array<Array<unknown>>> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCsvRows(await file.text())
  }

  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    return await readSheet(file)
  }

  throw new Error(
    'Format file belum didukung. Simpan file Excel-nya sebagai .xlsx atau .csv dulu (file .xls lama belum bisa dibaca).',
  )
}
