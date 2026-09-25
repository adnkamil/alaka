import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findMergeTarget,
  isMergeableStatus,
  isSameCustomer,
  mergeItemLines,
  mergePaidAmount,
  normalizeCustomerName,
} from './order-merge'
import type { MergeableOrder } from './order-merge'

/**
 * Tes aturan penggabungan pesanan (satu pelanggan = satu tagihan per event).
 * Modulnya murni, jadi bisa diuji tanpa database (`pnpm test`).
 */

function order(overrides: Partial<MergeableOrder> = {}): MergeableOrder {
  return {
    id: overrides.id ?? 'order-1',
    customerName: overrides.customerName ?? 'Budi',
    paymentStatus: overrides.paymentStatus ?? 'unpaid',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    paidAmount: overrides.paidAmount ?? '0',
    items: overrides.items ?? [
      { name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 1 },
    ],
  }
}

describe('normalizeCustomerName & isSameCustomer', () => {
  it('beda kapital/spasi tetap dianggap pelanggan yang sama', () => {
    assert.equal(normalizeCustomerName('  Budi   Santoso '), 'budi santoso')
    assert.equal(isSameCustomer('Budi Santoso', ' budi   santoso '), true)
  })

  it('pelanggan beda tidak dianggap sama', () => {
    assert.equal(isSameCustomer('Budi', 'Budi Santoso'), false)
    // Dua orang beda yang namanya sama tapi beda digit HP tetap beda pelanggan.
    assert.equal(isSameCustomer('Budi 1234', 'Budi 5678'), false)
  })
})

describe('isMergeableStatus', () => {
  it('hanya unpaid & dp yang boleh ditambahi barang', () => {
    assert.equal(isMergeableStatus('unpaid'), true)
    assert.equal(isMergeableStatus('dp'), true)
    assert.equal(isMergeableStatus('paid'), false)
    assert.equal(isMergeableStatus('shipped'), false)
  })
})

describe('findMergeTarget', () => {
  it('ambil pesanan pelanggan yang sama & masih belum lunas', () => {
    const target = order({ id: 'target' })
    assert.equal(findMergeTarget([target], 'budi'), target)
  })

  it('pesanan lunas/dikirim tidak jadi tujuan penggabungan', () => {
    assert.equal(
      findMergeTarget([order({ paymentStatus: 'paid' })], 'Budi'),
      undefined,
    )
    assert.equal(
      findMergeTarget([order({ paymentStatus: 'shipped' })], 'Budi'),
      undefined,
    )
  })

  it('kalau ada beberapa kandidat, yang paling baru dipakai', () => {
    const older = order({
      id: 'older',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const newer = order({
      id: 'newer',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    })

    assert.equal(findMergeTarget([older, newer], 'Budi')?.id, 'newer')
    assert.equal(findMergeTarget([newer, older], 'Budi')?.id, 'newer')
  })

  it('pelanggan lain tidak ikut ketarik', () => {
    assert.equal(
      findMergeTarget([order({ customerName: 'Siti' })], 'Budi'),
      undefined,
    )
  })
})

describe('mergeItemLines', () => {
  it('barang dengan nama, harga, & fee sama persis -> qty-nya dijumlah', () => {
    const merged = mergeItemLines(
      [{ name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 2 }],
      [{ name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 3 }],
    )

    assert.deepEqual(merged, [
      {
        name: 'Barang A',
        originalPrice: 10_000,
        fee: 2_000,
        qty: 5,
        obtained: false,
      },
    ])
  })

  it('barang beda harga/fee tetap jadi baris terpisah', () => {
    const merged = mergeItemLines(
      [{ name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 1 }],
      [
        { name: 'Barang A', originalPrice: 12_000, fee: 2_000, qty: 1 },
        { name: 'Barang A', originalPrice: 10_000, fee: 3_000, qty: 1 },
        { name: 'Barang B', originalPrice: 10_000, fee: 2_000, qty: 1 },
      ],
    )

    assert.equal(merged.length, 4)
    assert.equal(merged[0].qty, 1)
    assert.equal(merged[3].name, 'Barang B')
  })

  it('barang yang sudah didapat tetap ditandai didapat', () => {
    const merged = mergeItemLines(
      [
        {
          name: 'Barang A',
          originalPrice: 10_000,
          fee: 2_000,
          qty: 1,
          obtained: true,
        },
      ],
      [{ name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 1 }],
    )

    assert.equal(merged[0].obtained, true)
    assert.equal(merged[0].qty, 2)
  })

  it('barang lama tidak diubah (input tidak dimutasi)', () => {
    const existing = [
      { name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 1 },
    ]
    mergeItemLines(existing, [
      { name: 'Barang A', originalPrice: 10_000, fee: 2_000, qty: 4 },
    ])

    assert.equal(existing[0].qty, 1)
  })
})

describe('mergePaidAmount', () => {
  it('uang yang sudah masuk ditambah pembayaran baru', () => {
    assert.equal(mergePaidAmount('50000', 25_000, 200_000), 75_000)
  })

  it('tidak boleh melebihi total baru', () => {
    assert.equal(mergePaidAmount('150000', 100_000, 120_000), 120_000)
  })

  it('nominal negatif/tidak wajar dirapikan', () => {
    assert.equal(mergePaidAmount('-5000', 0, 100_000), 0)
  })
})
