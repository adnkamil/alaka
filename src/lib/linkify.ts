/**
 * Ubah teks biasa jadi potongan teks + link, supaya URL yang diketik admin di
 * deskripsi event (mis. https://www.imbex.co.id/) bisa diklik di halaman
 * detail. Sengaja TIDAK memakai dangerouslySetInnerHTML: hasilnya berupa data,
 * dan komponen yang merender-nya memakai elemen React biasa.
 *
 * Yang dikenali: `http://`, `https://`, dan `www.` (href-nya diberi https://).
 * Skema lain (javascript:, data:, dst) tidak pernah jadi link.
 */

export type LinkifyPart =
  { type: 'text'; text: string } | { type: 'link'; text: string; href: string }

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi

/** Tanda baca di ujung yang biasanya bagian kalimat, bukan bagian URL. */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * Buang tanda baca di ujung URL. Kurung penutup hanya dibuang kalau tidak ada
 * kurung pembukanya di dalam URL, jadi "(lihat https://a.id)" benar tapi
 * "https://id.wikipedia.org/wiki/Foo_(bar)" tetap utuh.
 */
function trimTrailing(raw: string): string {
  let url = raw
  for (;;) {
    const stripped = url.replace(TRAILING_PUNCTUATION, '')
    if (stripped !== url) {
      url = stripped
      continue
    }
    const last = url.charAt(url.length - 1)
    const opener = CLOSERS[last]
    if (opener) {
      const opens = url.split(opener).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) {
        url = url.slice(0, -1)
        continue
      }
    }
    return url
  }
}

function toHref(text: string): string | null {
  const candidate = /^www\./i.test(text) ? `https://${text}` : text
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname.includes('.')) return null
    return parsed.href
  } catch {
    return null
  }
}

export function linkify(input: string): Array<LinkifyPart> {
  const parts: Array<LinkifyPart> = []
  let cursor = 0

  const pushText = (text: string) => {
    if (!text) return
    const last = parts.at(-1)
    if (last && last.type === 'text') last.text += text
    else parts.push({ type: 'text', text })
  }

  for (const match of input.matchAll(URL_PATTERN)) {
    const start = match.index
    const text = trimTrailing(match[0])
    const href = toHref(text)
    pushText(input.slice(cursor, start))
    if (href) {
      parts.push({ type: 'link', text, href })
      pushText(match[0].slice(text.length))
    } else {
      pushText(match[0])
    }
    cursor = start + match[0].length
  }
  pushText(input.slice(cursor))
  return parts
}

/** Nama tampilan link: domain + path, tanpa skema, `www.`, query, dan `/` akhir. */
export function linkLabel(href: string): string {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./i, '')
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${path}`
  } catch {
    return href
  }
}

export type LinkPlatform = 'instagram' | 'whatsapp' | 'web'

/** Dipakai untuk memilih ikon chip. Selain yang dikenal, jatuh ke `web`. */
export function linkPlatform(href: string): LinkPlatform {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return 'instagram'
    }
    if (host === 'wa.me' || host === 'whatsapp.com') return 'whatsapp'
    return 'web'
  } catch {
    return 'web'
  }
}

export type DescriptionBlock =
  | { type: 'text'; parts: Array<LinkifyPart> }
  | { type: 'links'; links: Array<{ text: string; href: string }> }

/**
 * Pecah deskripsi jadi blok. Baris yang isinya HANYA link (satu atau lebih,
 * dipisah spasi) jadi blok `links` (ditampilkan sebagai chip). Baris lain
 * dikelompokkan jadi blok `text` dengan link inline; baris kosong di antara
 * teks tetap terjaga lewat `\n`.
 */
export function splitDescription(input: string): Array<DescriptionBlock> {
  const blocks: Array<DescriptionBlock> = []
  let textBuffer: Array<string> = []

  const flushText = () => {
    if (textBuffer.length === 0) return
    const joined = textBuffer.join('\n')
    textBuffer = []
    if (joined.trim() === '') return
    blocks.push({ type: 'text', parts: linkify(joined) })
  }

  for (const line of input.split(/\r?\n/)) {
    const parts = linkify(line)
    const links = parts.filter((p) => p.type === 'link')
    const onlyLinks =
      links.length > 0 &&
      parts.every((p) => p.type === 'link' || p.text.trim() === '')
    if (onlyLinks) {
      flushText()
      const items = links.map((p) => ({ text: p.text, href: p.href }))
      const last = blocks.at(-1)
      if (last && last.type === 'links') last.links.push(...items)
      else blocks.push({ type: 'links', links: items })
    } else {
      textBuffer.push(line)
    }
  }
  flushText()
  return blocks
}
