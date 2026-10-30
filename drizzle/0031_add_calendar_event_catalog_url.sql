ALTER TABLE "calendar_event" ADD COLUMN "catalog_url" varchar;--> statement-breakpoint
-- Link katalog dulu per partner. Salin ke semua event milik partner itu supaya
-- jastiper tetap melihat tombol unduh di event yang sudah ada.
UPDATE "calendar_event" SET "catalog_url" = "partners"."catalog_url" FROM "partners" WHERE "calendar_event"."partner_id" = "partners"."id" AND "partners"."catalog_url" IS NOT NULL;
