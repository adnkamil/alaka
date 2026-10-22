ALTER TABLE "calendar_event" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD COLUMN "ended_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill: sebelumnya "online" ditebak dari teks lokasi yang diawali kata
-- "Online" (aturan lama di tab Event). Event lama dipertahankan perilakunya.
UPDATE "calendar_event" SET "is_online" = true WHERE "location" ~* '^\s*online\M';
