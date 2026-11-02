CREATE TYPE "public"."partner_option_type" AS ENUM('ukuran', 'variasi');--> statement-breakpoint
CREATE TABLE "item_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"partner_variant_id" uuid,
	"product_name" varchar NOT NULL,
	"size" varchar,
	"variation" varchar,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "item_components_qty_pos" CHECK ("item_components"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "partner_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_product_id" uuid NOT NULL,
	"type" "partner_option_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_group_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"image_url" varchar
);
--> statement-breakpoint
CREATE TABLE "partner_pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"min_qty" integer NOT NULL,
	"bundle_price" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_pricing_rules_min_qty_pos" CHECK ("partner_pricing_rules"."min_qty" > 0),
	CONSTRAINT "partner_pricing_rules_price_nonneg" CHECK ("partner_pricing_rules"."bundle_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "partner_rule_products" (
	"rule_id" uuid NOT NULL,
	"partner_product_id" uuid NOT NULL,
	CONSTRAINT "partner_rule_products_rule_id_partner_product_id_pk" PRIMARY KEY("rule_id","partner_product_id")
);
--> statement-breakpoint
CREATE TABLE "partner_variant_values" (
	"variant_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	CONSTRAINT "partner_variant_values_variant_id_option_value_id_pk" PRIMARY KEY("variant_id","option_value_id")
);
--> statement-breakpoint
CREATE TABLE "partner_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_product_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"sku" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"track_stock" boolean DEFAULT false NOT NULL,
	"stock_qty" integer,
	"allow_preorder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_variants_price_nonneg" CHECK ("partner_variants"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "partner_products" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_bundle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "partner_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "partner_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "hpp" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "partner_products" ADD COLUMN "has_variants" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_partner_variant_id_partner_variants_id_fk" FOREIGN KEY ("partner_variant_id") REFERENCES "public"."partner_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_option_groups" ADD CONSTRAINT "partner_option_groups_partner_product_id_partner_products_id_fk" FOREIGN KEY ("partner_product_id") REFERENCES "public"."partner_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_option_values" ADD CONSTRAINT "partner_option_values_option_group_id_partner_option_groups_id_fk" FOREIGN KEY ("option_group_id") REFERENCES "public"."partner_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_pricing_rules" ADD CONSTRAINT "partner_pricing_rules_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_rule_products" ADD CONSTRAINT "partner_rule_products_rule_id_partner_pricing_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."partner_pricing_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_rule_products" ADD CONSTRAINT "partner_rule_products_partner_product_id_partner_products_id_fk" FOREIGN KEY ("partner_product_id") REFERENCES "public"."partner_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_variant_values" ADD CONSTRAINT "partner_variant_values_variant_id_partner_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."partner_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_variant_values" ADD CONSTRAINT "partner_variant_values_option_value_id_partner_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."partner_option_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_variants" ADD CONSTRAINT "partner_variants_partner_product_id_partner_products_id_fk" FOREIGN KEY ("partner_product_id") REFERENCES "public"."partner_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_components_item_idx" ON "item_components" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_components_variant_idx" ON "item_components" USING btree ("partner_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_option_groups_product_type_uq" ON "partner_option_groups" USING btree ("partner_product_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_option_values_group_name_uq" ON "partner_option_values" USING btree ("option_group_id","name");--> statement-breakpoint
CREATE INDEX "partner_pricing_rules_partner_idx" ON "partner_pricing_rules" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_rule_products_product_uq" ON "partner_rule_products" USING btree ("partner_product_id");--> statement-breakpoint
CREATE INDEX "partner_variant_values_option_idx" ON "partner_variant_values" USING btree ("option_value_id");--> statement-breakpoint
CREATE INDEX "partner_variants_product_idx" ON "partner_variants" USING btree ("partner_product_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_partner_variant_id_partner_variants_id_fk" FOREIGN KEY ("partner_variant_id") REFERENCES "public"."partner_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_partner_rule_id_partner_pricing_rules_id_fk" FOREIGN KEY ("partner_rule_id") REFERENCES "public"."partner_pricing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_price_required" CHECK ("partner_products"."has_variants" OR "partner_products"."price" IS NOT NULL);