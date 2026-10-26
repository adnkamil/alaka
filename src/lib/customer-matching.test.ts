import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  customerLabel,
  findCustomerForOrder,
  phoneMatchKey,
} from './customer-matching'

/**
 * Tes pencocokan order → customer (dipakai halaman Invoice & Tagihan untuk
 * ambil no. HP + alamat kirim). Pencocokan lewat NOMOR HP, bukan nama.
 * Modulnya murni, jadi bisa diuji tanpa database (`pnpm test`).
 */

const budi = { name: 'Budi', phone: '081234566608', address: 'Jl. A' }
const adnan = { name: 'Adnan', phone: '085156832285', address: 'Jl. B' }
const tanpaHp = { name: 'Rina', phone: null, address: 'Jl. C' }

describe('customerLabel', () => {
  it('pakai 4 digit terakhir no. HP', () => {
    assert.equal(customerLabel(budi), 'Budi 6608')
  })

  it('tanpa no. HP cukup namanya', () => {
    assert.equal(customerLabel(tanpaHp), 'Rina')
    assert.equal(customerLabel({ name: 'Budi', phone: null }), 'Budi')
  })
})

describe('phoneMatchKey', () => {
  it('menyamakan semua bentuk nomor', () => {
    assert.equal(phoneMatchKey('081234566608'), '081234566608')
    assert.equal(phoneMatchKey('0812-3456-6608'), '081234566608')
    assert.equal(phoneMatchKey('+62 812 3456 6608'), '081234566608')
    assert.equal(phoneMatchKey('81234566608'), '081234566608')
  })

  it('kosong / terlalu pendek = tidak ada kunci', () => {
    assert.equal(phoneMatchKey(null), '')
    assert.equal(phoneMatchKey(''), '')
    assert.equal(phoneMatchKey('6654'), '')
  })
})

describe('findCustomerForOrder', () => {
  it('cocok lewat nomor walau bentuk penulisannya beda', () => {
    assert.equal(findCustomerForOrder([budi], '+62 812-3456-6608'), budi)
    assert.equal(findCustomerForOrder([budi], '0812 3456 6608'), budi)
  })

  it('nama di pesanan boleh beda asal nomornya sama', () => {
    // Kasus typo: pesanan "adnsn" dengan nomor milik customer "Adnan".
    assert.equal(findCustomerForOrder([adnan], '085156832285'), adnan)
  })

  it('nama sama tapi nomor beda → tidak cocok', () => {
    const budiLain = { name: 'Budi', phone: '081299990000', address: 'Jl. D' }
    assert.equal(findCustomerForOrder([budi], '081299990000'), undefined)
    assert.equal(findCustomerForOrder([budiLain], '081234566608'), undefined)
  })

  it('order tanpa nomor tidak dicocokkan, walau namanya sama', () => {
    assert.equal(findCustomerForOrder([budi], null), undefined)
    assert.equal(findCustomerForOrder([budi], ''), undefined)
    assert.equal(findCustomerForOrder([budi], undefined), undefined)
  })

  it('customer tanpa nomor tidak pernah cocok', () => {
    assert.equal(findCustomerForOrder([tanpaHp], '081234566608'), undefined)
  })

  it('daftar kosong = tidak ketemu', () => {
    assert.equal(findCustomerForOrder([], '081234566608'), undefined)
  })
})
