CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_key_created_idx" ON "login_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "partner_sessions_expires_idx" ON "partner_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
-- Token sesi sekarang disimpan sebagai hash sha256 (lib/session-token.ts).
-- Hash-kan token lama di tempat supaya sesi yang sedang aktif tetap valid
-- (tidak ada yang ter-logout). Token mentah berupa UUID (36 karakter), hash
-- hex-nya 64 karakter, jadi baris yang sudah di-hash dilewati.
UPDATE "sessions" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE length("token") <> 64;--> statement-breakpoint
UPDATE "partner_sessions" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE length("token") <> 64;
