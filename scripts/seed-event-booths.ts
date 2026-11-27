// Isi daftar booth (fitur "Cari Booth") untuk satu event kalender. UI admin
// untuk input booth belum ada, jadi sementara lewat script ini.
//
// Cara pakai:
//   pnpm db:seed-booths                         -> daftar event offline yang akan datang (cari id-nya)
//   pnpm db:seed-booths <calendarEventId>       -> isi dari scripts/data/imbex-2026-booths.json
//   pnpm db:seed-booths <calendarEventId> <file.json>
//   pnpm db:seed-booths:neon ...                -> sama, ke Neon (.env.neon.local)
//
// Isi file: array { code, brand, area }. Data lama di event itu DIGANTI
// seluruhnya, jadi aman dijalankan ulang setelah floorplan direvisi.

import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { z } from 'zod'
config({ path: ['.env.local', '.env'] })

const DEFAULT_FILE = 'scripts/data/imbex-2026-booths.json'

const boothsSchema = z
  .array(
    z.object({
      code: z.string().trim().min(1),
      brand: z.string().trim().min(1),
      area: z.string().trim().min(1),
    }),
  )
  .min(1)

async function main() {
  const [calendarEventId, file = DEFAULT_FILE] = process.argv.slice(2)

  // Import dinamis: static import naik duluan sebelum config() sempat mengisi
  // DATABASE_URL (pola yang sama dengan seed-calendar-events.ts).
  const { and, asc, eq, gte, sql } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { calendarEvents } = await import('../src/db/schema')
  const { todayIsoDateInAppTimeZone } = await import('../src/lib/timezone')

  if (!calendarEventId) {
    const rows = await db
      .select({
        id: calendarEvents.id,
        name: calendarEvents.name,
        eventDate: calendarEvents.eventDate,
        booths: sql<number>`jsonb_array_length(${calendarEvents.booths})`,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.isOnline, false),
          gte(
            sql`coalesce(${calendarEvents.endDate}, ${calendarEvents.eventDate})`,
            todayIsoDateInAppTimeZone(),
          ),
        ),
      )
      .orderBy(asc(calendarEvents.eventDate))
    console.log('Event offline yang akan datang:')
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.eventDate}  ${r.name}  (${r.booths} booth)`)
    }
    console.log('\nJalankan lagi dengan id event: pnpm db:seed-booths <id> [file]')
    process.exit(0)
  }

  const booths = boothsSchema.parse(JSON.parse(readFileSync(file, 'utf8')))

  const updated = await db
    .update(calendarEvents)
    .set({ booths, updatedAt: new Date() })
    .where(eq(calendarEvents.id, calendarEventId))
    .returning({ name: calendarEvents.name })
  const event = updated.at(0)
  if (!event) throw new Error(`Event ${calendarEventId} tidak ditemukan`)

  const areas = new Set(booths.map((b) => b.area)).size
  console.log(
    `Selesai: ${booths.length} brand di ${areas} area disimpan ke "${event.name}".`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
