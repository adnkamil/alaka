CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'expired', 'rejected');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_code" varchar DEFAULT 'pro' NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"started_at" timestamp,
	"ends_at" timestamp,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method_type",
	"payment_provider" varchar,
	"payment_sender_name" varchar,
	"payment_reference" varchar,
	"payment_proof_image" text,
	"payment_note" text,
	"paid_at" timestamp,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_amount_non_negative" CHECK ("subscriptions"."amount" >= 0),
	CONSTRAINT "subscriptions_period_order" CHECK ("subscriptions"."started_at" is null or "subscriptions"."ends_at" is null or "subscriptions"."ends_at" >= "subscriptions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp DEFAULT now() + interval '30 days' NOT NULL;--> statement-breakpoint
-- Backfill user yang sudah ada. Aturannya: "trial mulai saat user dibuat", jadi
-- trial mereka dihitung dari created_at — BUKAN dari waktu migrasi ini dijalankan
-- (default kolom akan mengisi waktu migrasi, itu sebabnya baris ini perlu ada).
-- Baris yang dibuat SETELAH migrasi sudah bernilai benar (trial_started_at ==
-- created_at) sehingga tidak ikut ter-update. Idempotent kalau dijalankan ulang.
UPDATE "users"
SET "trial_started_at" = "created_at",
    "trial_ends_at" = "created_at" + interval '30 days'
WHERE "trial_started_at" > "created_at";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_created_idx" ON "subscriptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_pending_per_user_unique" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_trial_period_order" CHECK ("users"."trial_ends_at" >= "users"."trial_started_at");