import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesSearch } from './partner-topbar-search.ts'

test('matchesSearch: kosong tidak cocok, huruf besar/kecil diabaikan', () => {
  assert.equal(matchesSearch('  ', 'Imbex Fair'), false)
  assert.equal(matchesSearch('imbex', 'Imbex Fair 2026'), true)
  assert.equal(matchesSearch('xyz', 'Imbex', null), false)
  assert.equal(matchesSearch('sku-1', 'Tas', 'SKU-123'), true)
})
