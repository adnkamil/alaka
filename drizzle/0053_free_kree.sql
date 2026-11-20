ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_replaces_not_self";--> statement-breakpoint
ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_replaces_fk";
--> statement-breakpoint
DROP INDEX "event_submissions_replaces_idx";--> statement-breakpoint
ALTER TABLE "event_submissions" DROP COLUMN "replaces_submission_id";