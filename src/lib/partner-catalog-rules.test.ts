import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATALOG_PDF_MAX_BASE64_LENGTH,
  CATALOG_PDF_MAX_BYTES,
  formatFileSize,
  isPdfBytes,
  partnerCatalogUrl,
  safeCatalogFileName,
} from './partner-catalog-rules.ts'

test('isPdfBytes mengenali PDF dari isinya, bukan dari nama', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n...')
  assert.equal(isPdfBytes(pdf), true)
  assert.equal(isPdfBytes(new TextEncoder().encode('<html>')), false)
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50])), false)
  assert.equal(isPdfBytes(new Uint8Array()), false)
})

test('safeCatalogFileName membersihkan path, kutip, dan karakter kontrol', () => {
  assert.equal(safeCatalogFileName('Katalog Q4.pdf', 'X'), 'Katalog Q4.pdf')
  assert.equal(safeCatalogFileName('katalog.PDF', 'X'), 'katalog.pdf')
  assert.equal(safeCatalogFileName('../../etc/passwd', 'X'), 'etc passwd.pdf')
  assert.equal(safeCatalogFileName('a"b\r\nc.pdf', 'X'), 'a b c.pdf')
  assert.equal(safeCatalogFileName('.hidden.pdf', 'X'), 'hidden.pdf')
  assert.equal(safeCatalogFileName('...', 'Katalog A'), 'Katalog A.pdf')
  assert.equal(
    safeCatalogFileName('   .pdf', 'Katalog Wikibex'),
    'Katalog Wikibex.pdf',
  )
  assert.equal(safeCatalogFileName('', ''), 'Katalog.pdf')
  assert.ok(safeCatalogFileName('x'.repeat(300), 'F').length <= 84)
})

test('formatFileSize dalam KB/MB berformat Indonesia', () => {
  assert.equal(formatFileSize(500), '1 KB')
  assert.equal(formatFileSize(150 * 1024), '150 KB')
  assert.equal(formatFileSize(2.5 * 1024 * 1024), '2,5 MB')
})

test('batas base64 cukup untuk batas byte', () => {
  assert.ok(
    CATALOG_PDF_MAX_BASE64_LENGTH >= Math.ceil(CATALOG_PDF_MAX_BYTES / 3) * 4,
  )
})

test('URL katalog memuat versi', () => {
  assert.equal(
    partnerCatalogUrl('p1', new Date(1700000000000)),
    '/api/partner-catalog/p1?v=1700000000000',
  )
})
