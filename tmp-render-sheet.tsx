// Probe sementara: render AddOrderSheet ke HTML statis lalu periksa atribut
// `required` pada field "Fee jastip" vs "Harga asli". Dihapus setelah dipakai.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AddOrderSheet from './src/components/AddOrderSheet'

const html = renderToStaticMarkup(
  createElement(AddOrderSheet, {
    eventName: 'Event Uji',
    feeTiers: [],
    onClose: () => {},
    onSubmit: async () => {},
  }),
)

const feeIdx = html.indexOf('Fee jastip')
const hargaIdx = html.indexOf('Harga asli')

if (feeIdx === -1 || hargaIdx === -1) {
  console.error('GAGAL: label "Fee jastip" / "Harga asli" tidak ditemukan')
  process.exit(1)
}

const feeSnippet = html.slice(feeIdx, feeIdx + 300)
const hargaSnippet = html.slice(hargaIdx, hargaIdx + 300)

console.log('--- Fee jastip ---\n' + feeSnippet)
console.log('--- Harga asli ---\n' + hargaSnippet)

const feeHasRequired = /<input[^>]*required/.test(feeSnippet)
const hargaHasRequired = /<input[^>]*required/.test(hargaSnippet)

console.log('\nfee required =', feeHasRequired)
console.log('harga asli required =', hargaHasRequired)
console.log('fee placeholder =', /placeholder="0"/.test(feeSnippet))

if (feeHasRequired || !hargaHasRequired) {
  console.error('\nHASIL: TIDAK SESUAI')
  process.exit(1)
}
console.log('\nHASIL: SESUAI (fee jastip opsional, harga asli tetap wajib)')
