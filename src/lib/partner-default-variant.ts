import { and, eq, inArray } from 'drizzle-orm'
import type { db as DbClient } from '../db'
import {
  partnerProducts,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'

/**
 * Produk tanpa "Buat varian" tetap perlu satu baris varian (Standar), karena
 * paket dan barang pesanan merujuk ke varian. Fungsi ini memastikan baris itu
 * ada dan harganya sama dengan harga induk. Idempoten: aman dipanggil berulang.
 * Dipanggil dengan db biasa atau transaksi (`executor`).
 */
export async function syncDefaultVariant(
  executor: typeof DbClient,
  productId: string,
): Promise<void> {
  const [product] = await executor
    .select({ hasVariants: partnerProducts.hasVariants, price: partnerProducts.price })
    .from(partnerProducts)
    .where(eq(partnerProducts.id, productId))
  if (!product || product.hasVariants || product.price === null) return

  const variants = await executor
    .select({ id: partnerVariants.id })
    .from(partnerVariants)
    .where(eq(partnerVariants.partnerProductId, productId))

  const links = variants.length
    ? await executor
        .select({ variantId: partnerVariantValues.variantId })
        .from(partnerVariantValues)
        .where(
          inArray(
            partnerVariantValues.variantId,
            variants.map((v) => v.id),
          ),
        )
    : []
  const linked = new Set(links.map((l) => l.variantId))
  const standard = variants.find((v) => !linked.has(v.id))

  if (!standard) {
    await executor.insert(partnerVariants).values({
      partnerProductId: productId,
      price: product.price,
      isActive: true,
    })
    return
  }
  await executor
    .update(partnerVariants)
    .set({ price: product.price, isActive: true })
    .where(and(eq(partnerVariants.id, standard.id)))
}
