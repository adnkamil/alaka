CREATE TABLE "partner_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"title" varchar NOT NULL,
	"body" text,
	"link" varchar,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_notifications" ADD CONSTRAINT "partner_notifications_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_notifications_partner_created_idx" ON "partner_notifications" USING btree ("partner_id","created_at");