// Seed data dummy: 10 event, tiap event 10-15 pesanan, campuran status
// Belum Lunas/Lunas/Dikirim, tanggal event tersebar di 6 bulan terakhir.
// Nama pelanggan diambil dari data Customer yang sudah ada. Kalau user target
// belum punya Customer sama sekali, script bikin customer dummy dulu supaya
// seed tetap jalan (nggak berhenti dengan error "belum ada customer").
//
// Cara pakai:
//   pnpm db:seed-dummy
//     -> otomatis pilih user yang punya Customer aktif TERBANYAK.
//   pnpm db:seed-dummy -- --email=kamu@email.com
//     -> pilih user tertentu (wajib kalau mau pilih akun lain).
//   pnpm db:seed-dummy -- --reset
//     -> hapus dulu event dummy lama (nama sama dengan script ini), lalu seed ulang.
//   pnpm db:seed-dummy -- --append
//     -> tetap seed walaupun data dummy sudah ada (hasilnya nambah/dobel).
//
// Tanpa --reset / --append, kalau event dummy sudah ada script berhenti biar
// nggak bikin data dobel tanpa sengaja.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

/** Customer dummy yang dibuat kalau user target belum punya Customer. */
const DUMMY_CUSTOMER_POOL = [
  { name: 'Nia', phone: '081234567801' },
  { name: 'Rika', phone: '081234567802' },
  { name: 'Dewi', phone: '081234567803' },
  { name: 'Salsa', phone: '081234567804' },
  { name: 'Ibu Ani', phone: '081234567805' },
  { name: 'Mbak Yuni', phone: '081234567806' },
  { name: 'Fitri', phone: '081234567807' },
  { name: 'Laras', phone: '081234567808' },
  { name: 'Vina', phone: '081234567809' },
  { name: 'Tata', phone: '081234567810' },
  { name: 'Bunda Ina', phone: '081234567811' },
  { name: 'Mama Rere', phone: '081234567812' },
]

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
  const { and, eq, inArray, isNull, sql } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { customers, events, items, orders, users } =
    await import('../src/db/schema')

  const emailArg = process.argv
    .find((a) => a.startsWith('--email='))
    ?.split('=')[1]
  const shouldReset = process.argv.includes('--reset')
  const shouldAppend = process.argv.includes('--append')

  // Pilih user target. Kalau --email nggak dikasih, JANGAN pakai findFirst()
  // polos: tanpa orderBy urutannya nggak pasti, jadi bisa kena user yang belum
  // punya Customer sama sekali (penyebab error "belum ada customer"). Sekarang
  // dipilih user dengan Customer aktif terbanyak supaya seed langsung "kena".
  let targetUser = emailArg
    ? await db.query.users.findFirst({ where: eq(users.email, emailArg) })
    : undefined

  if (emailArg && !targetUser) {
    throw new Error(`User dengan email "${emailArg}" tidak ditemukan.`)
  }

  if (!targetUser) {
    const customerCounts = await db
      .select({
        userId: customers.userId,
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .groupBy(customers.userId)
      .orderBy(sql`count(*) desc`)

    targetUser =
      customerCounts.length > 0
        ? await db.query.users.findFirst({
            where: eq(users.id, customerCounts[0].userId),
          })
        : await db.query.users.findFirst({
            orderBy: (u, { asc }) => asc(u.createdAt),
          })

    if (targetUser) {
      console.log(
        `User otomatis: ${targetUser.email} (punya ${customerCounts[0]?.total ?? 0} customer aktif).`,
      )
    }
  }

  if (!targetUser) {
    throw new Error('Belum ada user sama sekali di database.')
  }

  // Pakai Customer yang sudah ada; kalau belum ada sama sekali, bikin customer
  // dummy dulu supaya seed tetap bisa jalan.
  let savedCustomers = await db.query.customers.findMany({
    where: and(
      eq(customers.userId, targetUser.id),
      isNull(customers.deletedAt),
    ),
  })

  if (savedCustomers.length === 0) {
    console.log('User ini belum punya Customer — bikin customer dummy dulu...')
    savedCustomers = await db
      .insert(customers)
      .values(
        DUMMY_CUSTOMER_POOL.map((c) => ({
          userId: targetUser.id,
          name: c.name,
          phone: c.phone,
        })),
      )
      .returning()
    console.log(`  + ${savedCustomers.length} customer dummy dibuat.`)
  }

  console.log(
    `Seeding untuk user: ${targetUser.name} (${targetUser.email}) — pakai ${savedCustomers.length} customer.`,
  )

  // Cegah data dobel: kalau event dummy (nama sama dengan script ini) sudah ada,
  // default-nya berhenti dulu. Pakai --reset atau --append untuk lanjut.
  const existingDummyEvents = await db.query.events.findMany({
    where: and(
      eq(events.userId, targetUser.id),
      inArray(events.name, EVENT_NAMES),
    ),
    columns: { id: true },
  })

  if (existingDummyEvents.length > 0) {
    if (shouldReset) {
      await db
        .delete(events)
        .where(
          and(
            eq(events.userId, targetUser.id),
            inArray(events.name, EVENT_NAMES),
          ),
        )
      console.log(
        `--reset: ${existingDummyEvents.length} event dummy lama dihapus.`,
      )
    } else if (!shouldAppend) {
      console.log(
        `\n⚠ User ini sudah punya ${existingDummyEvents.length} event dummy (nama sama dengan script).`,
      )
      console.log('  Script berhenti biar data nggak dobel. Pilihan:')
      console.log(
        '    pnpm db:seed-dummy -- --reset    (hapus dummy lama, lalu seed ulang)',
      )
      console.log(
        '    pnpm db:seed-dummy -- --append   (tetap tambah data dummy baru)',
      )
      process.exit(0)
    }
  }

  let totalOrders = 0
  let totalItems = 0

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
          // qty variatif (1-3) supaya data dummy ikut menguji fitur jumlah.
          qty: randInt(1, 3),
          createdAt: orderDate,
        })
        totalItems += 1
      }
      totalOrders += 1
    }

    console.log(
      `  ✓ ${eventName} — ${orderCount} pesanan (${eventDate.toLocaleDateString('id-ID')})`,
    )
  }

  console.log(
    `Selesai! ${EVENT_NAMES.length} event, ${totalOrders} pesanan, ${totalItems} baris barang.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
