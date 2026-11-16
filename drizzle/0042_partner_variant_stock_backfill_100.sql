-- Backfill stok awal produk yang sudah ada diturunkan dari 9999 ke 100 pcs.
-- Hanya menyentuh varian yang masih persis 9999 (belum diisi ulang partner),
-- jadi aman dijalankan di database yang sudah memakai 0041 maupun yang baru.
UPDATE "partner_variants" SET "stock_qty" = 100 WHERE "stock_qty" = 9999;
