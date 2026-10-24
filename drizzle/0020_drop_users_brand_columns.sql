-- TAHAP "CONTRACT": membuang kolom brand lama di `users` (sumber kebenarannya
-- sekarang tabel `brands`). Datanya tidak bisa dikembalikan, jadi ada
-- PRE-FLIGHT yang hanya memblokir kasus data HILANG: nama/template di `users`
-- terisi tapi padanannya di `brands` kosong. Beda nilai TIDAK memblokir, karena
-- setelah tahap switch hanya `brands` yang diubah (nilai lama di `users` basi).
-- Trial tidak dicek: `brands.trial_*` NOT NULL. `avatar_updated_at` juga tidak
-- dicek: `brands.avatar_updated_at` sengaja dikosongkan saat backfill (file foto
-- di Netlify Blobs masih memakai key id user), jadi kolom lama itu cuma penanda
-- waktu; filenya sendiri tidak ikut terhapus. Kalau dibatalkan, tidak ada
-- perubahan sama sekali (satu transaksi).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n
  FROM users u
  JOIN brands b ON b.id = u.brand_id
  WHERE u.brand_role = 'owner'
    AND (
      (u.brand_name IS NOT NULL AND b.name IS NULL)
      OR (u.wa_message_template IS NOT NULL AND b.wa_message_template IS NULL)
    );
  IF n > 0 THEN
    RAISE EXCEPTION 'Migrasi 0020 dibatalkan: % owner masih punya nama/template brand di tabel users yang kosong di tabel brands (data akan hilang). Salin dulu ke brands, lalu ulangi.', n;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_trial_period_order";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "brand_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_updated_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "wa_message_template";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "trial_started_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "trial_ends_at";
