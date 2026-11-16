-- Stok per varian (produk tanpa varian memakai varian Standar). Default 0 =
-- habis. Varian yang sudah ada di-backfill ke 9999 supaya katalog dan event
-- yang berjalan tidak mendadak habis; partner menurunkannya ke angka sebenarnya.
UPDATE "partner_variants" SET "stock_qty" = 9999;--> statement-breakpoint
ALTER TABLE "partner_variants" ALTER COLUMN "stock_qty" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "partner_variants" ALTER COLUMN "stock_qty" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_variants" ADD CONSTRAINT "partner_variants_stock_nonneg" CHECK ("partner_variants"."stock_qty" >= 0);
