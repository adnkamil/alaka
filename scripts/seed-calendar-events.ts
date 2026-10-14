// Seed event kalender (tab "Event"). UI admin untuk input event belum ada,
// jadi sementara data diisi lewat script ini.
//
// Cara pakai:
//   pnpm db:seed-calendar          -> DB lokal (.env.local)
//   pnpm db:seed-calendar:neon     -> Neon (.env.neon.local)
//
// Tanggal dibuat relatif terhadap hari ini (WIB) supaya selalu ada event di
// bulan berjalan. Script aman dijalankan berulang: event dengan nama + tanggal
// yang sama tidak dobel (hanya detailnya yang diperbarui).

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

/** Offset hari dari hari ini -> data event contoh. */
const SAMPLES = [
  {
    offset: 2,
    name: 'Bazar Jastip Makassar',
    location: 'Phinisi Point Mall, Makassar',
    description:
      'Bazar jastip terbesar di Makassar: puluhan booth jastiper dan brand.\nGratis masuk, ada promo khusus pembeli pertama.',
    exhibitors: ['Somethinc', 'Wardah', 'Emina'],
  },
  {
    offset: 2,
    name: 'Pameran Produk Korea',
    location: 'Trans Studio Mall, Makassar',
    description: 'Pameran produk skincare dan makanan Korea.',
    exhibitors: ['COSRX', 'Innisfree', 'Laneige'],
  },
  {
    offset: 5,
    name: 'Open PO Skincare Fair',
    location: 'Online (Instagram Live)',
    description: 'Open PO bareng lewat Instagram Live, tanpa perlu datang.',
    exhibitors: [],
  },
  {
    offset: 9,
    name: 'Japan Expo Sale',
    location: 'Gedung Celebes Convention Center',
    description: null,
    exhibitors: ['Shiseido', 'Hada Labo'],
  },
  {
    offset: 14,
    name: 'Cuci Gudang Akhir Bulan',
    location: 'Gudang Mici, Makassar',
    description: null,
    exhibitors: [],
  },
  {
    offset: 21,
    name: 'Kopdar Jastiper Sulsel',
    location: 'Kafe Kopi Daeng, Makassar',
    description: 'Kopi darat sesama jastiper se-Sulawesi Selatan.',
    exhibitors: [],
  },
  {
    offset: 35,
    name: 'Pre-Order Harbolnas',
    location: 'Online',
    description: null,
    exhibitors: [],
  },
]

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

async function main() {
  // Import dinamis: static import naik duluan sebelum config() sempat mengisi
  // DATABASE_URL (pola yang sama dengan seed-dummy-data.ts).
  const { and, eq } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { calendarEvents } = await import('../src/db/schema')
  const { todayIsoDateInAppTimeZone } = await import('../src/lib/timezone')

  const today = todayIsoDateInAppTimeZone()
  let inserted = 0
  let skipped = 0

  for (const sample of SAMPLES) {
    const eventDate = addDays(today, sample.offset)
    const existing = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.name, sample.name),
        eq(calendarEvents.eventDate, eventDate),
      ),
    })
    const details = {
      location: sample.location,
      description: sample.description,
      exhibitors: sample.exhibitors,
    }
    if (existing) {
      // Event sudah ada: perbarui detailnya saja (aman dijalankan ulang).
      await db
        .update(calendarEvents)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(calendarEvents.id, existing.id))
      skipped++
      continue
    }
    await db
      .insert(calendarEvents)
      .values({ name: sample.name, eventDate, ...details })
    inserted++
  }

  console.log(
    `Selesai: ${inserted} event ditambah, ${skipped} sudah ada (diperbarui).`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
