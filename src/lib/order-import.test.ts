import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  IMPORT_TEMPLATE_HEADER,
  buildImportPreview,
  buildImportTemplateRows,
  findImportHeader,
  normalizePhoneNumber,
  parseCsvRows,
  parseImportMoney,
  splitCustomerNameAndPhone,
} from './order-import'

/**
 * Tes pembaca file import pesanan (Excel/CSV): parsing harga & nomor WA,
 * pencarian kolom, pengelompokan per pelanggan, dan pengisian fee dari aturan
 * fee event. Modulnya murni, jadi bisa diuji tanpa database (`pnpm test`).
 */

const TIERS = [
  { minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 },
  { minPrice: 20_000, maxPrice: 39_900, feeAmount: 6_000 },
]

const HEADER = ['No urut', 'Nama-no wa', 'item', 'harga']

describe('parseImportMoney', () => {
  it('sel angka dari Excel dipakai apa adanya', () => {
    assert.equal(parseImportMoney(35_000), 35_000)
    assert.equal(parseImportMoney(0), 0)
  })

  it('teks dengan Rp & pemisah ribuan gaya Indonesia', () => {
    assert.equal(parseImportMoney('Rp 12.500'), 12_500)
    assert.equal(parseImportMoney('Rp35.000'), 35_000)
    assert.equal(parseImportMoney('1.234.567'), 1_234_567)
  })

  it('dua pemisah -> yang paling belakang desimal', () => {
    assert.equal(parseImportMoney('12.500,50'), 12_500.5)
    assert.equal(parseImportMoney('12,500.50'), 12_500.5)
  })

  it('satu pemisah dengan 3 angka di belakang -> pemisah ribuan', () => {
    assert.equal(parseImportMoney('12.500'), 12_500)
    assert.equal(parseImportMoney('1,500'), 1_500)
  })

  it('selain itu dianggap desimal', () => {
    assert.equal(parseImportMoney('12500.5'), 12_500.5)
    assert.equal(parseImportMoney('12,5'), 12.5)
  })

  it('sel kosong / bukan angka -> null', () => {
    assert.equal(parseImportMoney(''), null)
    assert.equal(parseImportMoney('   '), null)
    assert.equal(parseImportMoney('belum tahu'), null)
    assert.equal(parseImportMoney(null), null)
    assert.equal(parseImportMoney(undefined), null)
    assert.equal(parseImportMoney(Number.NaN), null)
  })
})

describe('normalizePhoneNumber', () => {
  it('nomor lokal dibiarkan', () => {
    assert.equal(normalizePhoneNumber('081234567890'), '081234567890')
  })

  it('kode negara 62 / +62 diubah jadi awalan 0', () => {
    assert.equal(normalizePhoneNumber('+62 812-3456-7890'), '081234567890')
    assert.equal(normalizePhoneNumber('6281234567890'), '081234567890')
  })

  it('nomor tanpa 0 di depan tetap dibetulkan', () => {
    assert.equal(normalizePhoneNumber('81234567890'), '081234567890')
  })
})

describe('splitCustomerNameAndPhone', () => {
  it('nama dulu, lalu nomor', () => {
    assert.deepEqual(splitCustomerNameAndPhone('Nia - 08123456789'), {
      name: 'Nia',
      phone: '08123456789',
    })
  })

  it('nomor dulu, lalu nama', () => {
    assert.deepEqual(splitCustomerNameAndPhone('08123456789 Rina'), {
      name: 'Rina',
      phone: '08123456789',
    })
  })

  it('nomor dalam tanda kurung & pakai spasi', () => {
    assert.deepEqual(splitCustomerNameAndPhone('Ibu Ani (0812 3456 7890)'), {
      name: 'Ibu Ani',
      phone: '081234567890',
    })
  })

  it('nomor dengan kode negara', () => {
    assert.deepEqual(splitCustomerNameAndPhone('Salsa +62 812 3456 789'), {
      name: 'Salsa',
      phone: '08123456789',
    })
  })

  it('tanpa nomor -> seluruh sel jadi nama', () => {
    assert.deepEqual(splitCustomerNameAndPhone('Bunda Ina'), {
      name: 'Bunda Ina',
      phone: null,
    })
  })

  it('angka pendek bukan nomor (label "Nama 4digit" tetap utuh)', () => {
    assert.deepEqual(splitCustomerNameAndPhone('Budi Santoso 6608'), {
      name: 'Budi Santoso 6608',
      phone: null,
    })
  })
})

describe('parseCsvRows', () => {
  it('CSV koma biasa', () => {
    assert.deepEqual(parseCsvRows('a,b,c\n1,2,3\n'), [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('CSV dengan pemisah titik koma (Excel Indonesia)', () => {
    assert.deepEqual(parseCsvRows('a;b\n1;2'), [
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('kutip: pemisah & baris baru di dalam satu sel', () => {
    assert.deepEqual(parseCsvRows('"Nia, Bandung",12000\n"Nia ""A""",5000'), [
      ['Nia, Bandung', '12000'],
      ['Nia "A"', '5000'],
    ])
  })

  it('BOM & CRLF dari Excel dibuang', () => {
    assert.deepEqual(parseCsvRows('\uFEFFa,b\r\n1,2\r\n'), [
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('findImportHeader', () => {
  it('header di baris pertama', () => {
    const header = findImportHeader([HEADER, ['1', 'Nia', 'Kaos', '10.000']])
    assert.ok(header)
    assert.equal(header.index, 0)
    assert.equal(header.columns.customer, 1)
    assert.equal(header.columns.item, 2)
    assert.equal(header.columns.price, 3)
  })

  it('header di bawah baris judul tetap ketemu', () => {
    const header = findImportHeader([
      ['Rekap pesanan Wikibex'],
      [],
      HEADER,
      ['1', 'Nia', 'Kaos', '10.000'],
    ])
    assert.ok(header)
    assert.equal(header.index, 2)
  })

  it('"Nama Barang" dibaca sebagai kolom barang, bukan kolom nama', () => {
    const header = findImportHeader([['No', 'Nama Barang', 'Nama', 'Harga']])
    assert.ok(header)
    assert.equal(header.columns.item, 1)
    assert.equal(header.columns.name, 2)
  })

  it('kolom Nama & No WA yang terpisah juga didukung', () => {
    const header = findImportHeader([
      ['No urut', 'Nama', 'No WA', 'item', 'harga'],
    ])
    assert.ok(header)
    assert.equal(header.columns.name, 1)
    assert.equal(header.columns.phone, 2)
    assert.equal(header.columns.item, 3)
    assert.equal(header.columns.price, 4)
  })

  it('tanpa kolom wajib -> null', () => {
    assert.equal(findImportHeader([['No urut', 'Nama-no wa', 'harga']]), null)
  })
})

describe('buildImportPreview', () => {
  it('mengelompokkan baris per pelanggan + fee dari aturan fee event', () => {
    const preview = buildImportPreview(
      [
        HEADER,
        ['1', 'Nia - 08123456789', 'Kaos', 15_000],
        ['2', 'Rina', 'Celana', 25_000],
        ['3', 'Nia - 08123456789', 'Topi', 15_000],
      ],
      TIERS,
    )

    assert.equal(preview.fatalError, null)
    assert.equal(preview.errors.length, 0)
    assert.equal(preview.dataRows, 3)
    assert.equal(preview.orders.length, 2)

    const [nia, rina] = preview.orders
    assert.equal(nia.customerName, 'Nia')
    assert.equal(nia.customerPhone, '08123456789')
    assert.equal(nia.items.length, 2)
    assert.equal(nia.rowNumbers.length, 2)
    // fee dari tier: 15.000 -> 4.000, 25.000 -> 6.000
    assert.deepEqual(
      nia.items.map((item) => item.fee),
      [4_000, 4_000],
    )
    assert.equal(nia.subtotal, 30_000)
    assert.equal(nia.feeTotal, 8_000)
    assert.equal(nia.total, 38_000)

    assert.equal(rina.customerPhone, null)
    assert.equal(rina.total, 31_000)
  })

  it('tanpa aturan fee (tiers kosong) -> fee 0', () => {
    const preview = buildImportPreview(
      [HEADER, ['1', 'Nia', 'Kaos', 35_000]],
      [],
    )

    assert.equal(preview.orders[0].items[0].fee, 0)
    assert.equal(preview.orders[0].total, 35_000)
  })

  it('harga di luar semua tier -> fee 0', () => {
    const preview = buildImportPreview(
      [HEADER, ['1', 'Nia', 'Kaos', 500_000]],
      TIERS,
    )

    assert.equal(preview.orders[0].items[0].fee, 0)
  })

  it('baris barang yang sama digabung jadi satu dengan qty', () => {
    const preview = buildImportPreview(
      [
        HEADER,
        ['1', 'Nia', 'Kaos', 15_000],
        ['2', 'Nia', 'kaos', 15_000],
        ['3', 'Nia', 'Kaos', 20_000],
      ],
      TIERS,
    )

    assert.equal(preview.orders.length, 1)
    assert.deepEqual(
      preview.orders[0].items.map((item) => [
        item.name,
        item.originalPrice,
        item.qty,
      ]),
      [
        ['Kaos', 15_000, 2],
        ['Kaos', 20_000, 1],
      ],
    )
    assert.equal(preview.orders[0].total, 2 * 19_000 + 26_000)
  })

  it('baris bermasalah dicatat dengan nomor baris Excel & tidak ikut import', () => {
    const preview = buildImportPreview(
      [
        HEADER,
        ['1', 'Nia', 'Kaos', 'Rp 15.000'],
        ['2', '', 'Celana', 25_000],
        ['3', 'Rina', '', 25_000],
        ['4', 'Salsa', 'Topi', 'belum tahu'],
        ['5', 'Dewi', 'Jaket', ''],
      ],
      TIERS,
    )

    assert.equal(preview.orders.length, 1)
    assert.equal(preview.dataRows, 1)
    assert.deepEqual(
      preview.errors.map((error) => error.rowNumber),
      [3, 4, 5, 6],
    )
  })

  it('baris kosong dilewati tanpa jadi error', () => {
    const preview = buildImportPreview(
      [HEADER, ['', '', '', ''], ['1', 'Nia', 'Kaos', 15_000]],
      TIERS,
    )

    assert.equal(preview.emptyRows, 1)
    assert.equal(preview.errors.length, 0)
    assert.equal(preview.orders.length, 1)
  })

  it('pelanggan yang sudah punya pesanan belum lunas ditandai bakal digabung', () => {
    const preview = buildImportPreview(
      [HEADER, ['1', 'Nia', 'Kaos', 15_000], ['2', 'Rina', 'Kaos', 15_000]],
      TIERS,
      {
        existingOrders: [
          {
            id: 'order-1',
            customerName: 'nia',
            paymentStatus: 'unpaid',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'order-2',
            customerName: 'Rina',
            paymentStatus: 'paid',
            createdAt: new Date('2026-01-01'),
          },
        ],
      },
    )

    assert.equal(preview.orders[0].mergeIntoExisting, true)
    assert.equal(preview.orders[1].mergeIntoExisting, false)
  })

  it('header tidak ada -> fatalError', () => {
    const preview = buildImportPreview(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      TIERS,
    )
    assert.ok(preview.fatalError)
    assert.equal(preview.orders.length, 0)
  })

  it('file cuma berisi header -> fatalError', () => {
    const preview = buildImportPreview([HEADER], TIERS)
    assert.ok(preview.fatalError)
  })

  it('melebihi batas baris -> fatalError', () => {
    const rows: Array<Array<unknown>> = [HEADER]
    for (let index = 0; index < 2_001; index++) {
      rows.push([String(index), 'Nia', 'Kaos', 15_000])
    }

    const preview = buildImportPreview(rows, TIERS)
    assert.match(preview.fatalError ?? '', /melebihi batas/)
  })

  it('melebihi batas pelanggan -> fatalError', () => {
    const rows: Array<Array<unknown>> = [HEADER]
    for (let index = 0; index < 501; index++) {
      rows.push([String(index), `Pelanggan ${index}`, 'Kaos', 15_000])
    }

    const preview = buildImportPreview(rows, TIERS)
    assert.match(preview.fatalError ?? '', /melebihi batas/)
  })
})

describe('buildImportTemplateRows', () => {
  it('berisi header yang dikenali + 4 baris data bernomor 1-4', () => {
    const rows = buildImportTemplateRows()
    assert.deepEqual(rows[0], [...IMPORT_TEMPLATE_HEADER])
    assert.equal(rows.length, 5)
    assert.deepEqual(
      rows.slice(1).map((row) => row[0]),
      [1, 2, 3, 4],
    )
  })

  it('tiap baris jumlah kolomnya sama dengan header', () => {
    const rows = buildImportTemplateRows()
    const width = IMPORT_TEMPLATE_HEADER.length
    assert.ok(rows.every((row) => row.length === width))
  })

  it('template bisa dibaca balik: 2 pelanggan, 4 baris, tanpa error', () => {
    const preview = buildImportPreview(buildImportTemplateRows(), TIERS)

    assert.equal(preview.fatalError, null)
    assert.deepEqual(preview.errors, [])
    assert.equal(preview.dataRows, 4)
    assert.equal(preview.orders.length, 2)
    assert.deepEqual(
      preview.orders.map((order) => [
        order.customerName,
        order.customerPhone,
        order.items.length,
      ]),
      [
        ['Nia', '08123456789', 2],
        ['Budi', '081298765432', 2],
      ],
    )
  })

  it('fee contohnya mengikuti aturan tier event (di luar tier = 0)', () => {
    const preview = buildImportPreview(buildImportTemplateRows(), TIERS)
    const [nia] = preview.orders

    // Kaos 15.000 -> tier 0..19.900 (fee 4.000); Sepatu 250.000 -> di luar semua tier (fee 0).
    assert.deepEqual(
      nia.items.map((item) => item.fee),
      [4_000, 0],
    )
    assert.equal(nia.subtotal, 265_000)
    assert.equal(nia.total, 269_000)
  })
})
