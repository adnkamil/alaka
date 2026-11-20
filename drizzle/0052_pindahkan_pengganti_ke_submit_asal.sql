-- Pengganti barang yang disanggah tidak lagi membuat submit baru: barangnya
-- tinggal di submit asal, dan submit itu dibuka lagi (`reopened_at`). Migrasi
-- ini memindahkan data dari model lama (submit pengganti tertaut lewat
-- `replaces_submission_id`) ke model baru, sebelum kolom lamanya dibuang.
-- Tanpa submit pengganti (data produksi sekarang) migrasi ini tidak mengubah apa pun.
UPDATE "items" i SET "submission_id" = s."replaces_submission_id" FROM "event_submissions" s WHERE i."submission_id" = s."id" AND s."replaces_submission_id" IS NOT NULL;--> statement-breakpoint
UPDATE "item_components" c SET "submission_id" = s."replaces_submission_id" FROM "event_submissions" s WHERE c."submission_id" = s."id" AND s."replaces_submission_id" IS NOT NULL;--> statement-breakpoint
UPDATE "item_status_logs" l SET "submission_id" = s."replaces_submission_id" FROM "event_submissions" s WHERE l."submission_id" = s."id" AND s."replaces_submission_id" IS NOT NULL;--> statement-breakpoint
-- Tagihan: nominal dan pcs submit pengganti digabung ke baris submit asal.
UPDATE "invoice_submissions" r SET "amount" = r."amount" + c."amount", "pcs" = r."pcs" + c."pcs" FROM (SELECT s."replaces_submission_id" AS "root_id", i."invoice_id", sum(i."amount") AS "amount", sum(i."pcs") AS "pcs" FROM "invoice_submissions" i INNER JOIN "event_submissions" s ON s."id" = i."submission_id" WHERE s."replaces_submission_id" IS NOT NULL GROUP BY 1, 2) c WHERE r."submission_id" = c."root_id" AND r."invoice_id" = c."invoice_id";--> statement-breakpoint
DELETE FROM "invoice_submissions" WHERE "submission_id" IN (SELECT "id" FROM "event_submissions" WHERE "replaces_submission_id" IS NOT NULL);--> statement-breakpoint
UPDATE "invoice_lines" l SET "submission_id" = s."replaces_submission_id" FROM "event_submissions" s WHERE l."submission_id" = s."id" AND s."replaces_submission_id" IS NOT NULL;--> statement-breakpoint
-- Submit asal dibuka lagi kalau penggantinya belum dicek.
UPDATE "event_submissions" r SET "stock_checked_at" = NULL, "reopened_at" = now() WHERE EXISTS (SELECT 1 FROM "event_submissions" c WHERE c."replaces_submission_id" = r."id" AND c."stock_checked_at" IS NULL);--> statement-breakpoint
DELETE FROM "event_submissions" WHERE "replaces_submission_id" IS NOT NULL;--> statement-breakpoint
-- Nomor submit tidak boleh berlubang setelah submit pengganti hilang.
UPDATE "event_submissions" SET "submit_no" = "submit_no" + 1000000 WHERE "event_id" IN (SELECT "event_id" FROM "event_submissions" GROUP BY "event_id" HAVING max("submit_no") <> count(*));--> statement-breakpoint
UPDATE "event_submissions" e SET "submit_no" = r."n" FROM (SELECT "id", row_number() OVER (PARTITION BY "event_id" ORDER BY "submit_no")::int AS "n" FROM "event_submissions" WHERE "submit_no" > 1000000) r WHERE e."id" = r."id";
