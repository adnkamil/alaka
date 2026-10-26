CREATE TABLE "partner_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"code" varchar,
	"price" numeric(12, 2) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"photo_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_products_price_nonneg" CHECK ("partner_products"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_products_partner_idx" ON "partner_products" USING btree ("partner_id");