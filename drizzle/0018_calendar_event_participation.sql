ALTER TABLE "brands" ADD COLUMN "wa_number" varchar;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "calendar_event_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_event_id_calendar_event_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_calendar_event_idx" ON "events" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_brand_calendar_event_unique" ON "events" USING btree ("brand_id","calendar_event_id") WHERE "events"."calendar_event_id" is not null;