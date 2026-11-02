import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Logika inti diuji lewat ketentuan: satu varian Standar per produk tanpa
// varian. Pengujian dengan database ada di staging; di sini cukup memastikan
// modulnya bisa dimuat tanpa membawa koneksi db ke runtime test.
describe('partner-default-variant', () => {
  it('mengekspor syncDefaultVariant', async () => {
    const mod = await import('./partner-default-variant')
    assert.equal(typeof mod.syncDefaultVariant, 'function')
  })
})
