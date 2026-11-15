ALTER TABLE "item_components" DROP CONSTRAINT "item_components_replaced_variant_id_partner_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "sanggah_deadline";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "decided_at";--> statement-breakpoint
ALTER TABLE "item_components" DROP COLUMN "approved_qty";--> statement-breakpoint
ALTER TABLE "item_components" DROP COLUMN "replaced_variant_id";--> statement-breakpoint
ALTER TABLE "item_components" DROP COLUMN "replaced_label";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "requested_qty";