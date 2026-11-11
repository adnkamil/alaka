ALTER TABLE "calendar_event" ADD COLUMN "slot_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "slot_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sanggah_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "approved_qty" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "requested_qty" integer;