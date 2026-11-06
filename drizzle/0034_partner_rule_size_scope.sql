CREATE TABLE "partner_rule_sizes" (
	"rule_id" uuid NOT NULL,
	"size_name" varchar NOT NULL,
	CONSTRAINT "partner_rule_sizes_rule_id_size_name_pk" PRIMARY KEY("rule_id","size_name")
);
--> statement-breakpoint
DROP INDEX "partner_rule_products_product_uq";--> statement-breakpoint
ALTER TABLE "partner_rule_sizes" ADD CONSTRAINT "partner_rule_sizes_rule_id_partner_pricing_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."partner_pricing_rules"("id") ON DELETE cascade ON UPDATE no action;
