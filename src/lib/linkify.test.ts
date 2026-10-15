import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  linkLabel,
  linkPlatform,
  linkify,
  splitDescription,
} from './linkify.ts'

describe('linkify', () => {
  it('mengubah URL polos jadi link', () => {
    assert.deepEqual(linkify('https://www.imbex.co.id/'), [
      {
        type: 'link',
        text: 'https://www.imbex.co.id/',
        href: 'https://www.imbex.co.id/',
      },
    ])
  })

  it('mempertahankan teks di sekitar URL', () => {
    assert.deepEqual(linkify('Info: https://www.imbex.co.id/ ya'), [
      { type: 'text', text: 'Info: ' },
      {
        type: 'link',
        text: 'https://www.imbex.co.id/',
        href: 'https://www.imbex.co.id/',
      },
      { type: 'text', text: ' ya' },
    ])
  })

  it('tanda baca di ujung kalimat tidak ikut jadi bagian link', () => {
    const parts = linkify('Daftar di https://imbex.co.id.')
    assert.deepEqual(parts[1], {
      type: 'link',
      text: 'https://imbex.co.id',
      href: 'https://imbex.co.id/',
    })
    assert.deepEqual(parts[2], { type: 'text', text: '.' })
  })

  it('kurung penutup milik kalimat dibuang, milik URL dipertahankan', () => {
    const a = linkify('(lihat https://imbex.co.id)')
    assert.equal(a[1]?.type === 'link' && a[1].text, 'https://imbex.co.id')
    const b = linkify('https://id.wikipedia.org/wiki/Foo_(bar)')
    assert.equal(
      b[0]?.type === 'link' && b[0].text,
      'https://id.wikipedia.org/wiki/Foo_(bar)',
    )
  })

  it('mengenali www. tanpa skema dan memberi https://', () => {
    assert.deepEqual(linkify('www.imbex.co.id'), [
      {
        type: 'link',
        text: 'www.imbex.co.id',
        href: 'https://www.imbex.co.id/',
      },
    ])
  })

  it('beberapa URL dan baris baru', () => {
    const parts = linkify('a https://a.id\nb http://b.id/x?y=1')
    assert.equal(parts.filter((p) => p.type === 'link').length, 2)
    assert.equal(parts[1]?.type === 'link' && parts[1].href, 'https://a.id/')
  })

  it('skema berbahaya tidak jadi link', () => {
    for (const s of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://a.id',
    ]) {
      assert.ok(
        linkify(s).every((p) => p.type === 'text'),
        s,
      )
    }
  })

  it('teks tanpa URL tetap satu bagian teks', () => {
    assert.deepEqual(linkify('Bazar produk lokal'), [
      { type: 'text', text: 'Bazar produk lokal' },
    ])
    assert.deepEqual(linkify(''), [])
  })
})

describe('linkLabel / linkPlatform', () => {
  it('menampilkan domain + path saja', () => {
    assert.equal(linkLabel('https://www.imbex.co.id/'), 'imbex.co.id')
    assert.equal(
      linkLabel('https://www.instagram.com/adnkamil'),
      'instagram.com/adnkamil',
    )
    assert.equal(linkLabel('https://a.id/x/?utm=1#top'), 'a.id/x')
  })

  it('mengenali platform', () => {
    assert.equal(linkPlatform('https://www.instagram.com/x'), 'instagram')
    assert.equal(linkPlatform('https://wa.me/62812'), 'whatsapp')
    assert.equal(linkPlatform('https://imbex.co.id/'), 'web')
    assert.equal(linkPlatform('https://notinstagram.com/'), 'web')
  })
})

describe('splitDescription', () => {
  it('link sendiri di satu baris jadi chip, teks tetap teks', () => {
    const blocks = splitDescription(
      'ini event\n\nhttps://www.instagram.com/adnkamil\n\nhttps://www.imbex.co.id/',
    )
    assert.equal(blocks.length, 2)
    assert.equal(blocks[0]?.type, 'text')
    const links = blocks[1]
    assert.ok(links.type === 'links')
    assert.deepEqual(
      links.links.map((l) => l.href),
      ['https://www.instagram.com/adnkamil', 'https://www.imbex.co.id/'],
    )
  })

  it('link di tengah kalimat tetap inline', () => {
    const blocks = splitDescription(
      'daftar di https://imbex.co.id ya\nhttps://imbex.co.id',
    )
    assert.equal(blocks[0]?.type, 'text')
    assert.equal(blocks[1]?.type, 'links')
  })

  it('dua link sebaris jadi dua chip', () => {
    const blocks = splitDescription('https://a.id https://b.id')
    assert.ok(blocks[0]?.type === 'links' && blocks[0].links.length === 2)
  })

  it('deskripsi kosong atau tanpa link', () => {
    assert.deepEqual(splitDescription(''), [])
    assert.equal(splitDescription('halo')[0]?.type, 'text')
  })
})
