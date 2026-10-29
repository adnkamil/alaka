CREATE TABLE "partner_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"plan_code" varchar DEFAULT 'pro' NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method_type",
	"payment_provider" varchar,
	"payment_sender_name" varchar,
	"payment_reference" varchar,
	"payment_proof_stored" boolean DEFAULT false NOT NULL,
	"payment_note" text,
	"paid_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_subscriptions" ADD CONSTRAINT "partner_subscriptions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_subscriptions" ADD CONSTRAINT "partner_subscriptions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_subscriptions_partner_created_idx" ON "partner_subscriptions" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_subscriptions_status_idx" ON "partner_subscriptions" USING btree ("status");