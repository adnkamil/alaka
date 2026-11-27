ALTER TABLE "calendar_event" ADD COLUMN "min_purchase_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "event_submissions" ADD COLUMN "submitted_total" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_min_purchase_pos" CHECK ("calendar_event"."min_purchase_amount" > 0);