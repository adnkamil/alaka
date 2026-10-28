import assert from 'node:assert/strict'
import test from 'node:test'
import {
  JOIN_DISCLOSURE_SHARED,
  joinDisclosureText,
} from './join-disclosure.ts'

test('keterangan menyebut penyelenggara dan semua data yang dibagikan', () => {
  const text = joinDisclosureText('Wikibex Official')
  assert.ok(text.includes('Wikibex Official'))
  for (const item of JOIN_DISCLOSURE_SHARED) {
    assert.ok(text.includes(item), item)
  }
})

test('keterangan menegaskan isi pesanan dan data customer tidak dibagikan', () => {
  const text = joinDisclosureText('X')
  assert.match(text, /Isi pesanan dan data customermu tidak ikut dibagikan/)
})

test('daftar data yang dibagikan: nomor WhatsApp termasuk (harus jujur)', () => {
  assert.ok(JOIN_DISCLOSURE_SHARED.includes('nomor WhatsApp'))
  assert.equal(JOIN_DISCLOSURE_SHARED.length, 4)
})
