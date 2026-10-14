ALTER TABLE "calendar_event" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "exhibitors" text[] DEFAULT '{}'::text[] NOT NULL;