import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATALOG_URL_MAX_LENGTH,
  catalogDownloadUrl,
  catalogHost,
  parseCatalogUrl,
} from './partner-catalog-rules.ts'

test('link kosong = hapus link', () => {
  assert.deepEqual(parseCatalogUrl(''), { ok: true, url: null })
  assert.deepEqual(parseCatalogUrl('   '), { ok: true, url: null })
})

test('link https yang wajar diterima dan dinormalkan', () => {
  const r = parseCatalogUrl(
    '  https://Drive.Google.com/file/d/abc123/view?usp=sharing ',
  )
  assert.deepEqual(r, {
    ok: true,
    url: 'https://drive.google.com/file/d/abc123/view?usp=sharing',
  })
  assert.equal(parseCatalogUrl('https://example.com/katalog.pdf').ok, true)
})

test('skema selain https ditolak', () => {
  for (const bad of [
    'http://example.com/k.pdf',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'ftp://example.com/k.pdf',
    'file:///etc/passwd',
    '//example.com/k.pdf',
  ]) {
    assert.equal(parseCatalogUrl(bad).ok, false, bad)
  }
})

test('bukan URL, tanpa skema, kredensial, localhost, dan IP ditolak', () => {
  for (const bad of [
    'katalog saya',
    'example.com/k.pdf',
    'https://user:pass@example.com/k.pdf',
    'https://user@example.com/k.pdf',
    'https://localhost/k.pdf',
    'https://intranet/k.pdf',
    'https://127.0.0.1/k.pdf',
    'https://192.168.1.5/k.pdf',
    'https://[::1]/k.pdf',
  ]) {
    assert.equal(parseCatalogUrl(bad).ok, false, bad)
  }
})

test('link terlalu panjang ditolak', () => {
  const long = `https://example.com/${'a'.repeat(CATALOG_URL_MAX_LENGTH)}`
  assert.equal(parseCatalogUrl(long).ok, false)
})

test('link berkas Google Drive diubah ke bentuk unduh langsung', () => {
  const direct = 'https://drive.google.com/uc?export=download&id=1AbC_dEf-9'
  assert.equal(
    catalogDownloadUrl(
      'https://drive.google.com/file/d/1AbC_dEf-9/view?usp=sharing',
    ),
    direct,
  )
  assert.equal(
    catalogDownloadUrl('https://drive.google.com/open?id=1AbC_dEf-9'),
    direct,
  )
  assert.equal(
    catalogDownloadUrl(
      'https://drive.google.com/uc?id=1AbC_dEf-9&export=download',
    ),
    direct,
  )
})

test('link non-berkas (folder Drive, situs lain) dipakai apa adanya', () => {
  for (const url of [
    'https://drive.google.com/drive/folders/1abc',
    'https://drive.google.com/open?id=bad id!',
    'https://example.com/k.pdf',
    'https://docs.google.com/document/d/1abc/edit',
  ]) {
    assert.equal(catalogDownloadUrl(url), url)
  }
})

test('catalogHost menampilkan nama situs tanpa www', () => {
  assert.equal(catalogHost('https://www.example.com/k.pdf'), 'example.com')
  assert.equal(
    catalogHost('https://drive.google.com/file/d/x/view'),
    'drive.google.com',
  )
  assert.equal(catalogHost('bukan url'), '')
})
