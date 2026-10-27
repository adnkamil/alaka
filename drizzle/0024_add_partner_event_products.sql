CREATE TABLE "partner_event_products" (
	"calendar_event_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_products_calendar_event_id_product_id_pk" PRIMARY KEY("calendar_event_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "partner_event_products" ADD CONSTRAINT "partner_event_products_calendar_event_id_calendar_event_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_products" ADD CONSTRAINT "partner_event_products_product_id_partner_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."partner_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_event_products_product_idx" ON "partner_event_products" USING btree ("product_id");