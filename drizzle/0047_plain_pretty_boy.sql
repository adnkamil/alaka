ALTER TYPE "public"."invoice_status" ADD VALUE 'menunggu_review';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'lunas';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_proof_stored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_reject_reason" text;