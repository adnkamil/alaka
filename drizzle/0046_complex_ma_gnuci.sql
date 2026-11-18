CREATE TYPE "public"."invoice_status" AS ENUM('ditagih', 'dibatalkan');--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"label" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_submissions" (
	"invoice_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"pcs" integer NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "invoice_submissions_invoice_id_submission_id_pk" PRIMARY KEY("invoice_id","submission_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigint GENERATED ALWAYS AS IDENTITY (sequence name "invoices_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"calendar_event_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'ditagih' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"total_pcs" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_submissions" ADD CONSTRAINT "invoice_submissions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_submissions" ADD CONSTRAINT "invoice_submissions_submission_id_event_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_calendar_event_id_calendar_event_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_submissions_active_unique" ON "invoice_submissions" USING btree ("submission_id") WHERE released_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_calendar_event_idx" ON "invoices" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "invoices_brand_event_idx" ON "invoices" USING btree ("brand_id","event_id");