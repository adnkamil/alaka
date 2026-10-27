import { Download, Package, Store } from 'lucide-react'
import { formatFileSize } from '../lib/partner-catalog-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import type { PartnerShowcase as PartnerShowcaseData } from '../lib/partner-showcase-queries'

/**
 * Etalase partner di halaman event jastiper (read-only): beberapa produk
 * unggulan + tombol unduh katalog PDF lengkap. Tidak tampil kalau partner
 * belum memilih produk dan belum mengunggah katalog.
 */
export default function PartnerShowcase({
  showcase,
}: {
  showcase: PartnerShowcaseData
}) {
  const { products, catalog } = showcase
  if (products.length === 0 && !catalog) return null

  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Store size={14} style={{ color: 'var(--app-accent)' }} />
        Produk dari {showcase.partnerName}
      </h2>

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product) => (
            <div key={product.id} className="app-card overflow-hidden">
              <div
                className="flex w-full items-center justify-center"
                style={{
                  aspectRatio: '1 / 1',
                  background: 'var(--app-accent-soft)',
                  color: 'var(--app-accent)',
                }}
              >
                {product.photoUrl ? (
                  <img
                    src={product.photoUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package size={28} />
                )}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-sm font-semibold">
                  {product.name}
                </p>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {formatRupiah(product.price)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {catalog && (
        <a
          href={catalog.url}
          download
          className="app-btn-outline mt-3 flex items-center justify-center gap-2 no-underline"
        >
          <Download size={16} />
          Unduh katalog lengkap (PDF · {formatFileSize(catalog.size)})
        </a>
      )}
    </section>
  )
}
