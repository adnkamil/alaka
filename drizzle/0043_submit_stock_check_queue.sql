CREATE TABLE "stock_check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_event_id" uuid NOT NULL,
	"status" varchar DEFAULT 'running' NOT NULL,
	"upper_seq" bigint NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"current_submission_id" uuid,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "stock_check_runs_status_valid" CHECK ("stock_check_runs"."status" in ('running', 'paused', 'done', 'failed')),
	CONSTRAINT "stock_check_runs_seq_nonneg" CHECK ("stock_check_runs"."last_seq" >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_submissions" ADD COLUMN "queue_seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "event_submissions_queue_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "event_submissions" ADD COLUMN "stock_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_check_runs" ADD CONSTRAINT "stock_check_runs_calendar_event_id_calendar_event_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_runs" ADD CONSTRAINT "stock_check_runs_current_submission_id_event_submissions_id_fk" FOREIGN KEY ("current_submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_check_runs_one_running" ON "stock_check_runs" USING btree ("calendar_event_id") WHERE "stock_check_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "event_submissions_queue_seq_unique" ON "event_submissions" USING btree ("queue_seq");--> statement-breakpoint
UPDATE "event_submissions" AS s SET "stock_checked_at" = s."submitted_at" WHERE NOT EXISTS (SELECT 1 FROM "items" AS i WHERE i."submission_id" = s."id" AND i."submit_status" = 'pengajuan') AND NOT EXISTS (SELECT 1 FROM "item_components" AS c WHERE c."submission_id" = s."id" AND c."submit_status" = 'pengajuan');
