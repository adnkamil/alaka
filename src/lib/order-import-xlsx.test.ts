import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildImportPreview, readRowsFromFile } from './order-import'

/**
 * Tes jalur `.xlsx`: bikin file Excel minimal (ZIP "stored", tanpa kompresi)
 * lalu bacanya lewat `readSheet` dari `read-excel-file/browser` — pemakaian
 * yang sama dengan `ImportOrdersModal`.
 *
 * Alasannya ada: library-nya pernah berubah API (v9 mengubah `readXlsxFile`
 * jadi mengembalikan daftar sheet, bukan daftar baris). Tes ini yang menangkap
 * perubahan seperti itu sebelum sampai ke user, karena `order-import.test.ts`
 * cuma menguji baris-baris yang sudah jadi.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** ZIP sederhana (semua entry "stored") — cukup buat dibaca read-excel-file. */
function buildZip(entries: Array<{ name: string; text: string }>) {
  const encoder = new TextEncoder()
  const locals: Array<Uint8Array> = []
  const centrals: Array<Uint8Array> = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const data = encoder.encode(entry.text)
    const crc = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true) // versi minimum
    localView.setUint16(8, 0, true) // metode: stored
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true) // versi pembuat
    centralView.setUint16(6, 20, true) // versi minimum
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const bytes = new Uint8Array(offset + centralSize + end.length)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    bytes.set(part, cursor)
    cursor += part.length
  }
  return bytes
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function columnName(index: number) {
  let name = ''
  let n = index
  for (;;) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
    if (n < 0) return name
  }
}

/**
 * Bikin file `.xlsx` sederhana dari data baris demi baris.
 * Angka ditulis sebagai angka, teks lewat `sharedStrings` — sama seperti file
 * yang disimpan Excel beneran.
 */
function buildXlsxFile(
  rows: Array<Array<string | number>>,
  name = 'pesanan.xlsx',
) {
  const sharedStrings: Array<string> = []

  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`
          if (typeof value === 'number') {
            return `<c r="${ref}"><v>${value}</v></c>`
          }
          sharedStrings.push(value)
          return `<c r="${ref}" t="s"><v>${sharedStrings.length - 1}</v></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')

  const bytes = buildZip([
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Pesanan" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetData>${sheetData}</sheetData></worksheet>`,
    },
    {
      name: 'xl/sharedStrings.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${NS}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`,
    },
  ])

  return new File([new Uint8Array(bytes)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Fee contoh: di bawah 20rb → 3.000, 20rb–100rb → 5.000, di atas itu tak ada. */
const TIERS = [
  { minPrice: 0, maxPrice: 20_000, feeAmount: 3_000 },
  { minPrice: 20_001, maxPrice: 100_000, feeAmount: 5_000 },
]

describe('readRowsFromFile + buildImportPreview (file .xlsx asli)', () => {
  it('membaca file .xlsx lengkap dengan judul di atas header', async () => {
    const file = buildXlsxFile([
      ['Rekap pesanan jastip'],
      ['No urut', 'Nama-no wa', 'item', 'harga'],
      [1, 'Nia - 08123456789', 'Kaos', 15_000],
      [2, 'Nia - 08123456789', 'Kaos', '15.000'],
      [3, 'nia - 08123456789', 'Celana', 'Rp 30.000'],
      [4, 'Budi (0877 111 222)', 'Topi', '5.000'],
      [5, 'Sari | 0899-000-111', 'Jaket', '250000'],
      [6, 'Rusak', 'Sepatu', ''],
    ])

    const preview = buildImportPreview(await readRowsFromFile(file), TIERS)

    assert.equal(preview.fatalError, null)
    assert.equal(preview.emptyRows, 0)
    // Baris 1 (judul) & baris 2 (header) tidak dihitung; baris 8 error.
    assert.equal(preview.dataRows, 5)
    assert.deepEqual(preview.errors, [
      { rowNumber: 8, message: 'Harga belum diisi' },
    ])

    // "Nia", "Nia", "nia" jadi satu tagihan; Kaos qty 2 (baris 3 & 4).
    assert.deepEqual(
      preview.orders.map((order) => order.customerName),
      ['Nia', 'Budi', 'Sari'],
    )
    const [nia, budi, sari] = preview.orders
    assert.equal(nia.customerPhone, '08123456789')
    assert.deepEqual(nia.rowNumbers, [3, 4, 5])
    assert.deepEqual(nia.items, [
      { name: 'Kaos', originalPrice: 15_000, fee: 3_000, qty: 2 },
      { name: 'Celana', originalPrice: 30_000, fee: 5_000, qty: 1 },
    ])
    assert.equal(nia.total, 15_000 * 2 + 3_000 * 2 + 30_000 + 5_000)

    // Nama + no WA dalam tanda kurung / dipisah "|" dua-duanya dikenali.
    assert.equal(budi.customerPhone, '0877111222')
    assert.equal(budi.total, (5_000 + 3_000) * 1)
    assert.equal(sari.customerPhone, '0899000111')
    // 250.000 di luar semua tier → fee 0 (bukan bikin import gagal).
    assert.equal(sari.total, 250_000)
  })

  it('menandai pelanggan yang sudah punya pesanan belum lunas', async () => {
    const file = buildXlsxFile([
      ['Nama-no wa', 'item', 'harga'],
      ['Nia - 08123456789', 'Kaos', 15_000],
      ['Budi - 0877111222', 'Topi', 5_000],
    ])

    const preview = buildImportPreview(await readRowsFromFile(file), TIERS, {
      existingOrders: [
        {
          id: 'order-1',
          customerName: 'NIA',
          paymentStatus: 'unpaid',
          createdAt: new Date('2024-01-01'),
        },
      ],
    })

    assert.deepEqual(
      preview.orders.map((order) => [
        order.customerName,
        order.mergeIntoExisting,
      ]),
      [
        ['Nia', true],
        ['Budi', false],
      ],
    )
  })

  it('menolak format file yang belum didukung', async () => {
    const file = new File(['apa saja'], 'pesanan.xls')
    await assert.rejects(
      () => readRowsFromFile(file),
      /Format file belum didukung/,
    )
  })

  it('membaca file .csv dengan pemisah titik koma', async () => {
    const file = new File(
      ['Nama-no wa;item;harga\nNia - 08123456789;Kaos;15.000'],
      'pesanan.csv',
    )
    const preview = buildImportPreview(await readRowsFromFile(file), TIERS)

    assert.equal(preview.fatalError, null)
    assert.equal(preview.orders.length, 1)
    assert.equal(preview.orders[0].customerName, 'Nia')
    assert.equal(preview.orders[0].items[0].fee, 3_000)
  })
})
