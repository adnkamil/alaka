-- PRE-FLIGHT (tahap constrain): batalkan SELURUH migrasi dengan pesan yang
-- jelas kalau datanya belum siap. Drizzle menjalankan migrasi dalam satu
-- transaksi, jadi kalau di sini gagal, tidak ada perubahan skema sama sekali.
-- Perbaikannya: jalankan `db:backfill-brands --apply`, lalu `--verify`.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'fee_rules', 'customers', 'payment_methods', 'events', 'subscriptions', 'activity_logs'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE brand_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Migrasi 0012 dibatalkan: % baris di tabel % belum punya brand_id. Jalankan "db:backfill-brands --apply" lalu "--verify" dulu.', n, t;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM (
    SELECT brand_id FROM subscriptions WHERE status = 'pending' GROUP BY brand_id HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migrasi 0012 dibatalkan: % brand punya lebih dari satu pengajuan PRO pending. Setujui/tolak salah satunya dulu.', n;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_rules" DROP CONSTRAINT "fee_rules_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_rules" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_rules" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_brand_idx" ON "customers" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "events_brand_idx" ON "events" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "fee_rules_brand_idx" ON "fee_rules" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "payment_methods_brand_idx" ON "payment_methods" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "subscriptions_brand_created_idx" ON "subscriptions" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_pending_per_brand_unique" ON "subscriptions" USING btree ("brand_id") WHERE "subscriptions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "users_brand_idx" ON "users" USING btree ("brand_id");