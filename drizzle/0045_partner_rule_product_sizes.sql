CREATE TABLE "partner_rule_product_sizes" (
	"rule_id" uuid NOT NULL,
	"partner_product_id" uuid NOT NULL,
	"size_name" varchar NOT NULL,
	CONSTRAINT "partner_rule_product_sizes_rule_id_partner_product_id_size_name_pk" PRIMARY KEY("rule_id","partner_product_id","size_name")
);
--> statement-breakpoint
ALTER TABLE "partner_rule_product_sizes" ADD CONSTRAINT "partner_rule_product_sizes_rule_product_fk" FOREIGN KEY ("rule_id","partner_product_id") REFERENCES "public"."partner_rule_products"("rule_id","partner_product_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Pindahkan rentang ukuran dari aturan ke tiap produk di aturan.
-- Aturan dengan rentang: ukuran produk yang namanya ada di rentang itu.
-- Aturan tanpa rentang (semua ukuran): semua ukuran produk saat ini.
INSERT INTO "partner_rule_product_sizes" ("rule_id", "partner_product_id", "size_name")
SELECT DISTINCT rp."rule_id", rp."partner_product_id", ov."name"
FROM "partner_rule_products" rp
JOIN "partner_option_groups" og
  ON og."partner_product_id" = rp."partner_product_id" AND og."type" = 'ukuran'
JOIN "partner_option_values" ov ON ov."option_group_id" = og."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "partner_rule_sizes" rs WHERE rs."rule_id" = rp."rule_id"
)
OR EXISTS (
  SELECT 1 FROM "partner_rule_sizes" rs
  WHERE rs."rule_id" = rp."rule_id" AND rs."size_name" = ov."name"
);
--> statement-breakpoint
DROP TABLE "partner_rule_sizes" CASCADE;
