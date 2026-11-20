CREATE INDEX "items_submission_idx" ON "items" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "item_components_submission_idx" ON "item_components" USING btree ("submission_id");