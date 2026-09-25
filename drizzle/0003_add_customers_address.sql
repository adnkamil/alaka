-- 0003_add_customers_address
--
-- Fitur "Alamat customer": kolom `customers.address` (opsional) yang diisi di
-- halaman Profil → Customer.
--
-- Statement `subscription_settings` ikut terbawa waktu `pnpm db:generate` karena
-- tabel itu sebelumnya dibuat di database lewat `db:push` (tanpa file migrasi)
-- di commit "feat(admin): implement admin dashboard and subscription
-- management". Supaya file ini tetap aman dijalankan di database yang tabelnya
-- SUDAH ADA (lokal & produksi, sudah berisi data) sekaligus tetap lengkap untuk
-- database yang dibangun dari nol, bagian tersebut dibuat idempotent
-- (`IF NOT EXISTS` + cek `pg_constraint`).

ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qris_image" text,
	"pro_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'subscription_settings_updated_by_users_id_fk'
			AND conrelid = 'public.subscription_settings'::regclass
	) THEN
		ALTER TABLE "subscription_settings" ADD CONSTRAINT "subscription_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
