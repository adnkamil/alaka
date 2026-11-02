CREATE TABLE "partner_rule_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"rule_name" varchar NOT NULL,
	"change_type" varchar NOT NULL,
	"affected_items" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "partner_rule_notices" ADD CONSTRAINT "partner_rule_notices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_rule_notices_event_idx" ON "partner_rule_notices" USING btree ("event_id");
