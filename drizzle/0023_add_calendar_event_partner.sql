ALTER TABLE "calendar_event" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_partner_idx" ON "calendar_event" USING btree ("partner_id");