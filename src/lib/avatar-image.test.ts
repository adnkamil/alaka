import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSquareCrop } from './avatar-image'

test('computeSquareCrop memotong bagian tengah foto landscape', () => {
  assert.deepEqual(computeSquareCrop(400, 300), { sx: 50, sy: 0, size: 300 })
})

test('computeSquareCrop memotong bagian tengah foto portrait', () => {
  assert.deepEqual(computeSquareCrop(300, 500), { sx: 0, sy: 100, size: 300 })
})

test('computeSquareCrop tidak memotong foto yang sudah persegi', () => {
  assert.deepEqual(computeSquareCrop(256, 256), { sx: 0, sy: 0, size: 256 })
})

test('computeSquareCrop membulatkan ke bawah untuk selisih ganjil', () => {
  assert.deepEqual(computeSquareCrop(11, 6), { sx: 2, sy: 0, size: 6 })
})
