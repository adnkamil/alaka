import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PARTNER_LOCALE,
  isPartnerLocale,
  parsePartnerLocale,
} from './partner-locale'
import { partnerDictionaries } from './i18n/partner'

test('default bahasa partner adalah Inggris', () => {
  assert.equal(DEFAULT_PARTNER_LOCALE, 'en')
})

test('parsePartnerLocale menerima en/id dan menolak nilai lain', () => {
  assert.equal(parsePartnerLocale('id'), 'id')
  assert.equal(parsePartnerLocale('en'), 'en')
  assert.equal(parsePartnerLocale(undefined), 'en')
  assert.equal(parsePartnerLocale(''), 'en')
  assert.equal(parsePartnerLocale('fr'), 'en')
  assert.equal(parsePartnerLocale('ID'), 'en')
  assert.equal(isPartnerLocale('id'), true)
  assert.equal(isPartnerLocale(1), false)
})

/** Kumpulkan semua path kunci kamus, mis. "nav.dashboard". */
function keyPaths(value: unknown, prefix = ''): Array<string> {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

test('kamus en dan id punya kunci yang sama persis', () => {
  assert.deepEqual(
    keyPaths(partnerDictionaries.id).sort(),
    keyPaths(partnerDictionaries.en).sort(),
  )
})

test('tidak ada teks kamus yang kosong', () => {
  for (const [locale, dict] of Object.entries(partnerDictionaries)) {
    const empty = keyPaths(dict).filter((path) => {
      const leaf = path
        .split('.')
        .reduce<unknown>(
          (node, key) => (node as Record<string, unknown>)[key],
          dict,
        )
      return typeof leaf === 'string' && leaf.trim() === ''
    })
    assert.deepEqual(empty, [], `kosong di ${locale}`)
  }
})
