CREATE TYPE "public"."partner_credit_entry_type" AS ENUM('topup', 'admin_fee', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."partner_topup_method" AS ENUM('manual_qris', 'midtrans');--> statement-breakpoint
CREATE TYPE "public"."partner_topup_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "partner_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"type" "partner_credit_entry_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"topup_id" uuid,
	"invoice_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_credit_ledger_amount_nonzero" CHECK ("partner_credit_ledger"."amount" <> 0),
	CONSTRAINT "partner_credit_ledger_type_refs" CHECK (("partner_credit_ledger"."type" = 'topup' and "partner_credit_ledger"."topup_id" is not null and "partner_credit_ledger"."invoice_id" is null and "partner_credit_ledger"."amount" > 0)
        or ("partner_credit_ledger"."type" = 'admin_fee' and "partner_credit_ledger"."invoice_id" is not null and "partner_credit_ledger"."topup_id" is null and "partner_credit_ledger"."amount" < 0)
        or ("partner_credit_ledger"."type" = 'adjustment' and "partner_credit_ledger"."topup_id" is null and "partner_credit_ledger"."invoice_id" is null and "partner_credit_ledger"."note" is not null))
);
--> statement-breakpoint
CREATE TABLE "partner_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "partner_topup_method" DEFAULT 'manual_qris' NOT NULL,
	"status" "partner_topup_status" DEFAULT 'pending' NOT NULL,
	"external_id" varchar,
	"payment_proof_stored" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_topups_amount_min" CHECK ("partner_topups"."amount" >= 10000)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "admin_fee_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "admin_fee_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "credit_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_settings" ADD COLUMN "admin_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_credit_ledger" ADD CONSTRAINT "partner_credit_ledger_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_ledger" ADD CONSTRAINT "partner_credit_ledger_topup_id_partner_topups_id_fk" FOREIGN KEY ("topup_id") REFERENCES "public"."partner_topups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_ledger" ADD CONSTRAINT "partner_credit_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_credit_ledger" ADD CONSTRAINT "partner_credit_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_topups" ADD CONSTRAINT "partner_topups_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_topups" ADD CONSTRAINT "partner_topups_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_credit_ledger_partner_created_idx" ON "partner_credit_ledger" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_ledger_topup_unique" ON "partner_credit_ledger" USING btree ("topup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_ledger_invoice_unique" ON "partner_credit_ledger" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "partner_topups_partner_created_idx" ON "partner_topups" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_topups_status_idx" ON "partner_topups" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_topups_external_id_unique" ON "partner_topups" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_topups_pending_manual_unique" ON "partner_topups" USING btree ("partner_id") WHERE status = 'pending' and method = 'manual_qris';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_admin_fee_pair" CHECK (("invoices"."admin_fee_percent" is null) = ("invoices"."admin_fee_amount" is null));--> statement-breakpoint
ALTER TABLE "subscription_settings" ADD CONSTRAINT "subscription_settings_admin_fee_percent_range" CHECK ("subscription_settings"."admin_fee_percent" >= 0 and "subscription_settings"."admin_fee_percent" <= 100);