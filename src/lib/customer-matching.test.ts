import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { customerLabel, findCustomerForOrder } from './customer-matching'

/**
 * Tes pencocokan order → customer (dipakai halaman Invoice & Tagihan untuk
 * ambil no. HP + alamat kirim). Modulnya murni, jadi bisa diuji tanpa
 * database (`pnpm test`).
 */

const budi = { name: 'Budi', phone: '081234566608', address: 'Jl. A' }
const budiSantoso = {
  name: 'Budi Santoso',
  phone: '081234567777',
  address: 'Jl. B',
}
const tanpaHp = { name: 'Rina', phone: null, address: 'Jl. C' }

describe('customerLabel', () => {
  it('pakai 4 digit terakhir no. HP', () => {
    assert.equal(customerLabel(budi), 'Budi 6608')
    assert.equal(
      customerLabel({ name: 'Budi Santoso', phone: '0812-3456-7777' }),
      'Budi Santoso 7777',
    )
  })

  it('tanpa no. HP cukup namanya; nomor ada tapi pendek tetap ikut label', () => {
    assert.equal(customerLabel(tanpaHp), 'Rina')
    assert.equal(customerLabel({ name: 'Budi', phone: null }), 'Budi')
    // Perilaku lama (label di AddOrderSheet) tidak cek panjang nomor, jadi
    // "123" tetap dipakai apa adanya — sengaja dipertahankan supaya nama
    // pelanggan yang sudah tersimpan di pesanan lama tetap ketemu.
    assert.equal(customerLabel({ name: 'Budi', phone: '123' }), 'Budi 123')
  })
})

describe('findCustomerForOrder', () => {
  it('cocok lewat label lengkap "Nama 4digit"', () => {
    assert.equal(findCustomerForOrder([budi, budiSantoso], 'Budi 6608'), budi)
  })

  it('cocok lewat nama persis (nama diketik manual)', () => {
    assert.equal(findCustomerForOrder([budi, budiSantoso], 'Budi'), budi)
  })

  it('cocok lewat awalan label, dan nama terpanjang yang menang', () => {
    assert.equal(
      findCustomerForOrder([budi, budiSantoso], 'Budi Santoso 7777'),
      budiSantoso,
    )
    assert.equal(
      findCustomerForOrder([budi, budiSantoso], 'Budi Santoso'),
      budiSantoso,
    )
  })

  it('nama dengan spasi di ujung tetap dicocokkan', () => {
    assert.equal(findCustomerForOrder([budi], '  Budi 6608 '), budi)
  })

  it('tidak ketemu -> undefined (halaman invoice tetap jalan)', () => {
    assert.equal(findCustomerForOrder([budi], 'Siti 1234'), undefined)
    assert.equal(findCustomerForOrder([budi], 'Budiwijaya'), undefined)
    assert.equal(findCustomerForOrder([budi], ''), undefined)
    assert.equal(findCustomerForOrder([budi], '   '), undefined)
    assert.equal(findCustomerForOrder([], 'Budi'), undefined)
  })

  it('customer tanpa no. HP tetap bisa ketemu lewat nama', () => {
    assert.equal(findCustomerForOrder([tanpaHp], 'Rina'), tanpaHp)
  })
})
