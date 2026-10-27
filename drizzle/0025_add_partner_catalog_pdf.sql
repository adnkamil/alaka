ALTER TABLE "partners" ADD COLUMN "catalog_pdf_name" varchar;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "catalog_pdf_size" integer;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "catalog_pdf_updated_at" timestamp with time zone;