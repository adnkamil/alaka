CREATE TYPE "public"."submit_status" AS ENUM('pengajuan', 'disetujui', 'disanggah');--> statement-breakpoint
CREATE TABLE "event_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"submit_no" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_submissions_no_pos" CHECK ("event_submissions"."submit_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_status_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"item_id" uuid,
	"component_id" uuid,
	"submission_id" uuid,
	"from_status" "submit_status",
	"to_status" "submit_status",
	"qty" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_status_logs_qty_nonneg" CHECK ("item_status_logs"."qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "submit_status" "submit_status";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "submit_status" "submit_status";--> statement-breakpoint
ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_component_id_item_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."item_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_status_logs" ADD CONSTRAINT "item_status_logs_submission_id_event_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_submissions_event_no_unique" ON "event_submissions" USING btree ("event_id","submit_no");--> statement-breakpoint
CREATE INDEX "item_status_logs_event_idx" ON "item_status_logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "item_status_logs_item_idx" ON "item_status_logs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_status_logs_component_idx" ON "item_status_logs" USING btree ("component_id");--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_submission_id_event_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_submission_id_event_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_submit_pair" CHECK (("item_components"."submit_status" is null) = ("item_components"."submission_id" is null));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_submit_pair" CHECK (("items"."submit_status" is null) = ("items"."submission_id" is null));