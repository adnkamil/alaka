ALTER TABLE "calendar_event" ADD COLUMN "banner_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_event" DROP COLUMN "banner_url";