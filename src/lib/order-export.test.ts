import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ORDER_EXPORT_HEADER,
  buildOrderExportRows,
  orderExportFileName,
} from './order-export'

/**
 * Tes penyusun file export pesanan per event: header, satu baris per barang,
 * nomor urut, total per baris, dan nama filenya. Modulnya murni, jadi bisa
 * diuji tanpa database (`pnpm test`).
 */

const ORDERS = [
  {
    customerName: 'Budi',
    customerPhone: '081298765432',
    items: [
      { name: 'Tas', originalPrice: '120000', fee: '0', qty: 1 },
      { name: 'Topi', originalPrice: '45000', fee: '6000', qty: 2 },
    ],
  },
  {
    customerName: 'Nia',
    customerPhone: null,
    items: [{ name: 'Kaos', originalPrice: 15000, fee: 4000, qty: 1 }],
  },
]

describe('buildOrderExportRows', () => {
  it('baris pertama adalah header sesuai urutan kolom yang diminta', () => {
    assert.deepEqual(buildOrderExportRows([]), [ORDER_EXPORT_HEADER])
    assert.deepEqual(ORDER_EXPORT_HEADER, [
      'No urut',
      'Nama',
      'No WA',
      'Item',
      'Harga',
      'Fee',
      'Qty',
      'Total',
    ])
  })

  it('satu baris per barang, nomor urut lanjut 1..N', () => {
    const rows = buildOrderExportRows(ORDERS)

    assert.equal(rows.length, 4)
    assert.deepEqual(
      rows.slice(1).map((row) => row[0]),
      [1, 2, 3],
    )
  })

  it('diurutkan per nama pelanggan, urutan barang dalam pesanan tetap', () => {
    const rows = buildOrderExportRows(ORDERS)

    assert.deepEqual(
      rows.slice(1).map((row) => [row[1], row[3]]),
      [
        ['Budi', 'Tas'],
        ['Budi', 'Topi'],
        ['Nia', 'Kaos'],
      ],
    )
  })

  it('harga, fee, qty & total ditulis sebagai angka (bukan teks)', () => {
    const rows = buildOrderExportRows(ORDERS)
    const barisTopi = rows.find((row) => row[3] === 'Topi')

    assert.deepEqual(barisTopi, [
      2,
      'Budi',
      '081298765432',
      'Topi',
      45000,
      6000,
      2,
      // (45.000 + 6.000) x 2 = 102.000 — rumus lineTotal.
      102000,
    ])
    assert.equal(typeof barisTopi[4], 'number')
  })

  it('no. WA yang belum diisi jadi sel kosong', () => {
    const rows = buildOrderExportRows(ORDERS)
    const barisKaos = rows.find((row) => row[3] === 'Kaos')

    assert.equal(barisKaos?.[2], '')
  })

  it('harga dari database (string desimal) tetap dibaca sebagai angka', () => {
    const rows = buildOrderExportRows([
      {
        customerName: 'Nia',
        customerPhone: '08123456789',
        items: [
          {
            name: 'Sepatu',
            originalPrice: '250000.00',
            fee: '6000.50',
            qty: 2,
          },
        ],
      },
    ])

    assert.deepEqual(rows[1], [
      1,
      'Nia',
      '08123456789',
      'Sepatu',
      250000,
      6000.5,
      2,
      // (250.000 + 6.000,5) x 2 = 512.001
      512001,
    ])
  })

  it('pesanan tanpa barang tidak menambah baris', () => {
    const rows = buildOrderExportRows([
      { customerName: 'Nia', customerPhone: null, items: [] },
    ])

    assert.equal(rows.length, 1)
  })
})

describe('orderExportFileName', () => {
  it('nama event dibersihkan jadi slug huruf kecil', () => {
    assert.equal(
      orderExportFileName('Jastip Baju Anak (Bandung)'),
      'pesanan-jastip-baju-anak-bandung.xlsx',
    )
  })

  it('nama yang isinya cuma simbol jatuh ke nama default', () => {
    assert.equal(orderExportFileName('***'), 'pesanan-event.xlsx')
    assert.equal(orderExportFileName('   '), 'pesanan-event.xlsx')
  })
})
