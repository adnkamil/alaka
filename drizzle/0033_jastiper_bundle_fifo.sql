ALTER TABLE "items" ADD COLUMN "rule_name" varchar;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rule_min_qty" integer;--> statement-breakpoint
UPDATE "items" SET "rule_name" = r."name", "rule_min_qty" = r."min_qty"
  FROM "partner_pricing_rules" r
  WHERE "items"."partner_rule_id" = r."id" AND "items"."is_bundle" = true;--> statement-breakpoint
ALTER TABLE "item_components" ADD COLUMN "added_at" timestamp with time zone DEFAULT now() NOT NULL;
