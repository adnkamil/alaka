// Seed data dummy: 10 event, tiap event 10-15 pesanan, campuran status
// Belum Lunas/Lunas/Dikirim, tanggal event tersebar di 6 bulan terakhir.
// Nama pelanggan diambil dari data Customer yang SUDAH ada (bukan bikin baru).
//
// Cara pakai:
//   pnpm db:seed-dummy
//   (opsional) pnpm db:seed-dummy -- --email=kamu@email.com
//   kalau --email nggak dikasih, script pakai user PERTAMA yang ada di DB.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

const EVENT_NAMES = [
  'wikibex',
  'imoby',
  'pero',
  'imbex',
  'Nice kids cuci gudang',
  'Cuit PO',
  'Kiyomi Kids',
  'Denia Preloved',
  'Bilqis Ready Stock',
  'Cozy Tot Batch 2',
]

const ITEM_NAME_POOL = [
  'Jellyfish Short Sleeve Kids Pajamas',
  'Fruit Checkered Playsuit',
  'Jogger Pants Celana Panjang',
  'Dino Print Kids Hoodie',
  'Floral Dress Anak',
  'Stripe Kids T-Shirt',
  'Denim Overall Anak',
  'Kids Raincoat',
  'Cartoon Kids Socks Set',
  'Baby Romper Cotton',
]

const SIZE_POOL = ['1y', '2-3y', '3-4y', '5-6y', '6-12m', '9-10y']

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom<T>(arr: Array<T>): T {
  return arr[randInt(0, arr.length - 1)]
}

function feeForPrice(price: number) {
  if (price < 50_000) return 5_000
  if (price < 100_000) return 8_000
  if (price < 200_000) return 12_000
  if (price < 300_000) return 15_000
  return 20_000
}

function randomPrice() {
  // Kelipatan 100 biar mirip harga jual asli (xx.900 / xx.000)
  return randInt(150, 3000) * 100 - (Math.random() > 0.5 ? 100 : 0)
}

// Sebar 10 event ke 6 bulan terakhir: ~2 event/bulan buat 4 bulan pertama,
// 1 event/bulan buat 2 bulan terakhir (nggak semuanya numpuk di bulan ini).
const MONTH_BUCKETS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5]

function randomDateInMonthsAgo(monthsAgo: number) {
  const now = new Date()
  const target = new Date(
    now.getFullYear(),
    now.getMonth() - monthsAgo,
    randInt(1, 27),
  )
  // Jangan sampai ke masa depan kalau kebetulan bulan ini & tanggal random > hari ini.
  return target > now ? now : target
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  const now = new Date()
  return d > now ? now : d
}

async function main() {
  // Import dinamis, sengaja dilakukan DI SINI (bukan di paling atas file):
  // static import di ESM selalu "naik" duluan sebelum kode lain jalan,
  // jadi kalau db diimport statis, dia bakal kebaca sebelum config()
  // dotenv sempat ngisi DATABASE_URL — bikin koneksinya undefined.
  const { and, eq, isNull } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { customers, events, items, orders, users } = await import(
    '../src/db/schema'
  )

  const emailArg = process.argv
    .find((a) => a.startsWith('--email='))
    ?.split('=')[1]

  const targetUser = emailArg
    ? await db.query.users.findFirst({ where: eq(users.email, emailArg) })
    : await db.query.users.findFirst()

  if (!targetUser) {
    throw new Error(
      emailArg
        ? `User dengan email "${emailArg}" tidak ditemukan.`
        : 'Belum ada user sama sekali di database.',
    )
  }

  const savedCustomers = await db.query.customers.findMany({
    where: and(eq(customers.userId, targetUser.id), isNull(customers.deletedAt)),
  })

  if (savedCustomers.length === 0) {
    throw new Error(
      'Belum ada data Customer tersimpan untuk user ini. Tambahkan beberapa customer dulu lewat halaman Profil > Customer, baru jalankan seed ini lagi.',
    )
  }

  console.log(
    `Seeding untuk user: ${targetUser.name} (${targetUser.email}) — pakai ${savedCustomers.length} customer tersimpan.`,
  )

  for (let i = 0; i < EVENT_NAMES.length; i++) {
    const eventName = EVENT_NAMES[i]
    const eventDate = randomDateInMonthsAgo(MONTH_BUCKETS[i])

    const [event] = await db
      .insert(events)
      .values({
        userId: targetUser.id,
        name: eventName,
        eventDate,
        createdAt: eventDate,
        updatedAt: eventDate,
      })
      .returning()

    const orderCount = randInt(10, 15)

    // Pastikan tiap event ada minimal 1 dari tiap status, sisanya diacak.
    const statuses: Array<'unpaid' | 'paid' | 'shipped'> = [
      'unpaid',
      'paid',
      'shipped',
    ]
    while (statuses.length < orderCount) {
      statuses.push(pickRandom(['unpaid', 'paid', 'shipped'] as const))
    }
    statuses.sort(() => Math.random() - 0.5)

    for (let j = 0; j < orderCount; j++) {
      const customer = pickRandom(savedCustomers)
      const orderDate = addDays(eventDate, randInt(0, 10))

      const [order] = await db
        .insert(orders)
        .values({
          eventId: event.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          paymentStatus: statuses[j],
          createdAt: orderDate,
          updatedAt: orderDate,
        })
        .returning()

      const itemCount = randInt(1, 3)
      for (let k = 0; k < itemCount; k++) {
        const price = randomPrice()
        await db.insert(items).values({
          orderId: order.id,
          name: `${pickRandom(ITEM_NAME_POOL)} - ${pickRandom(SIZE_POOL)}`,
          originalPrice: price.toString(),
          fee: feeForPrice(price).toString(),
          createdAt: orderDate,
        })
      }
    }

    console.log(`  ✓ ${eventName} — ${orderCount} pesanan (${eventDate.toLocaleDateString('id-ID')})`)
  }

  console.log('Selesai!')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})