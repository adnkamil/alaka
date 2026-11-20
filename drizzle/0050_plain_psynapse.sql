ALTER TABLE "event_submissions" ADD COLUMN "replaces_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "replaces_item_id" uuid;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "replaces_component_id" uuid;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "replacement_waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "replaces_item_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "replaces_component_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "replacement_waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_replaces_fk" FOREIGN KEY ("replaces_submission_id") REFERENCES "public"."event_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_replaces_item_id_items_id_fk" FOREIGN KEY ("replaces_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_replaces_fk" FOREIGN KEY ("replaces_component_id") REFERENCES "public"."item_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_replaces_component_id_item_components_id_fk" FOREIGN KEY ("replaces_component_id") REFERENCES "public"."item_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_replaces_fk" FOREIGN KEY ("replaces_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_submissions_replaces_idx" ON "event_submissions" USING btree ("replaces_submission_id");--> statement-breakpoint
CREATE INDEX "item_components_replaces_idx" ON "item_components" USING btree ("replaces_component_id");--> statement-breakpoint
CREATE INDEX "item_components_replaces_item_idx" ON "item_components" USING btree ("replaces_item_id");--> statement-breakpoint
CREATE INDEX "items_replaces_idx" ON "items" USING btree ("replaces_item_id");--> statement-breakpoint
CREATE INDEX "items_replaces_component_idx" ON "items" USING btree ("replaces_component_id");--> statement-breakpoint
ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_replaces_not_self" CHECK ("event_submissions"."replaces_submission_id" is null or "event_submissions"."replaces_submission_id" <> "event_submissions"."id");