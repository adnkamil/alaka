-- PRE-FLIGHT: kolom brand_role bernilai default 'owner' untuk SEMUA akun yang
-- sudah ada, dan unique index "satu owner per brand" akan gagal kalau ada brand
-- dengan lebih dari satu akun. Sampai fitur admin dibuka ini tidak mungkin
-- terjadi; kalau terjadi, batalkan seluruh migrasi dengan pesan yang jelas
-- (Drizzle menjalankan migrasi dalam satu transaksi, jadi tidak ada setengah jadi).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT brand_id FROM users GROUP BY brand_id HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migrasi 0013 dibatalkan: % brand punya lebih dari satu akun. Tentukan pemilik tiap brand dulu sebelum menjalankan migrasi ini.', n;
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."brand_invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."brand_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TABLE "brand_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"email" varchar NOT NULL,
	"role" "brand_role" DEFAULT 'admin' NOT NULL,
	"token_hash" varchar NOT NULL,
	"status" "brand_invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"accepted_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "brand_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "brand_invitations_email_lowercase" CHECK ("brand_invitations"."email" = lower("brand_invitations"."email")),
	CONSTRAINT "brand_invitations_role_not_owner" CHECK ("brand_invitations"."role" <> 'owner')
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "brand_role" "brand_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_invitations" ADD CONSTRAINT "brand_invitations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invitations" ADD CONSTRAINT "brand_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invitations" ADD CONSTRAINT "brand_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_invitations_brand_status_idx" ON "brand_invitations" USING btree ("brand_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_invitations_pending_email_unique" ON "brand_invitations" USING btree ("brand_id","email") WHERE "brand_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_owner_per_brand" ON "users" USING btree ("brand_id") WHERE "users"."brand_role" = 'owner';