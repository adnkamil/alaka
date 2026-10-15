import { Globe, MessageCircle } from 'lucide-react'
import { linkLabel, linkPlatform, splitDescription } from '../lib/linkify'
import type { LinkPlatform } from '../lib/linkify'

function InstagramGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

function PlatformIcon({ platform }: { platform: LinkPlatform }) {
  if (platform === 'instagram') return <InstagramGlyph size={16} />
  if (platform === 'whatsapp') return <MessageCircle size={16} aria-hidden />
  return <Globe size={16} aria-hidden />
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer nofollow' }

/**
 * Deskripsi event. URL yang berdiri sendiri di satu baris tampil sebagai chip
 * (domain saja + ikon); URL di tengah kalimat tetap teks biasa berwarna aksen.
 */
export function EventDescription({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {splitDescription(text).map((block, i) =>
        block.type === 'links' ? (
          <div key={i} className="flex flex-wrap gap-2">
            {block.links.map((link, j) => (
              <a
                key={j}
                href={link.href}
                {...EXTERNAL}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium"
                style={{
                  color: 'var(--app-accent)',
                  border: '0.5px solid var(--app-border)',
                  background: 'var(--app-card)',
                }}
              >
                <span className="flex-shrink-0">
                  <PlatformIcon platform={linkPlatform(link.href)} />
                </span>
                <span className="truncate">{linkLabel(link.href)}</span>
              </a>
            ))}
          </div>
        ) : (
          <p
            key={i}
            className="whitespace-pre-line text-sm leading-relaxed"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {block.parts.map((part, j) =>
              part.type === 'link' ? (
                <a
                  key={j}
                  href={part.href}
                  {...EXTERNAL}
                  className="break-all font-medium"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {linkLabel(part.href)}
                </a>
              ) : (
                part.text
              ),
            )}
          </p>
        ),
      )}
    </div>
  )
}
