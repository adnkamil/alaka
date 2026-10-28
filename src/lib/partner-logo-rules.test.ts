import assert from 'node:assert/strict'
import test from 'node:test'
import { partnerInitial, partnerLogoUrl } from './partner-logo-rules.ts'

test('URL logo memakai versi dari logoUpdatedAt, null kalau belum ada logo', () => {
  assert.equal(partnerLogoUrl('p1', null), null)
  assert.equal(
    partnerLogoUrl('p1', new Date(1700000000000)),
    '/api/partner-logo/p1?v=1700000000000',
  )
  assert.equal(
    partnerLogoUrl('p1', '2023-11-14T22:13:20.000Z'),
    '/api/partner-logo/p1?v=1700000000000',
  )
})

test('inisial dari huruf pertama nama, huruf besar', () => {
  assert.equal(partnerInitial('wikibex'), 'W')
  assert.equal(partnerInitial('  imoby'), 'I')
  assert.equal(partnerInitial(''), '?')
})
