import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  PRO_DURATION_DAYS,
  PRO_PLAN_CODE,
  TRIAL_DAYS,
} from '../lib/subscription'

export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'dp',
  'paid',
  'shipped',
])

export const paymentMethodTypeEnum = pgEnum('payment_method_type', [
  'bank',
  'wallet',
  'qris',
])

// Status pengajuan/pembelian langganan (histori pembayaran manual).
// - pending  : user sudah kirim bukti transfer, menunggu verifikasi admin
// - active   : sudah diverifikasi, masa PRO berjalan (lihat started_at/ends_at)
// - expired  : masa PRO-nya sudah lewat (di-set saat pembersihan/servis manual;
//              akses sendiri dihitung dari ends_at, bukan dari status ini)
// - rejected : ditolak admin, boleh kirim pengajuan baru
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'expired',
  'rejected',
])

/**
 * Peran akun di dalam brand-nya. Tiap brand punya TEPAT SATU `owner` (dijaga
 * unique index di `users`); sisanya `admin` (batas jumlahnya diatur di kode,
 * lihat `lib/team-rules.ts`).
 */
export const brandRoleEnum = pgEnum('brand_role', ['owner', 'admin'])

export const brandInvitationStatusEnum = pgEnum('brand_invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
])

// BRANDS
// Satu brand = satu "toko" jastip: pemilik semua data bisnis (event, customer,
// aturan fee, metode bayar, langganan) dan identitas brand (nama, foto, template
// pesan, masa trial). Tabel `users` nantinya cuma berisi akun orangnya.
//
// Kolom brand lama di `users` (brand_name, avatar_updated_at,
// wa_message_template, trial_*) sudah dibuang (migrasi 0020): sumber
// kebenarannya sekarang hanya tabel ini.
//
// `brands.id` adalah UUID milik brand sendiri, TIDAK sama dengan id user mana
// pun. Kode harus selalu memakai `brand.id` / `session.brandId` untuk apa pun
// yang milik brand (termasuk key foto di Netlify Blobs), jangan `user.id`.
export const brands = pgTable(
  'brands',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar(),
    /** Penanda foto brand (null = belum ada) + cache-buster `?v=`; file di Blobs. */
    avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
    waMessageTemplate: text('wa_message_template'),
    /**
     * Nomor WhatsApp jastiper (format lokal, mis. `0853...`). Wajib terisi
     * sebelum brand bisa "Ikut Event" kalender; ditampilkan di tabel peserta
     * event untuk admin ALAKA dan (nanti) Partner Portal. Null = belum diisi.
     */
    waNumber: varchar('wa_number'),
    /** Awal & akhir masa trial.  */
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '${sql.raw(String(TRIAL_DAYS))} days'`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'brands_trial_period_order',
      sql`${table.trialEndsAt} >= ${table.trialStartedAt}`,
    ),
  ],
)

// USERS & AUTH
// Tabel ini murni akun orangnya. Identitas brand, masa trial, dan langganan ada
// di tabel `brands` / `subscriptions`; status akses dihitung di
// `src/lib/subscription.ts`.
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar().notNull(),
    email: varchar().notNull().unique(),
    passwordHash: varchar('password_hash'),
    googleId: varchar('google_id').unique(),
    /**
     * Kapan email terbukti milik user (klik link verifikasi, login Google yang
     * email-nya sudah diverifikasi Google, atau berhasil atur ulang kata sandi
     * lewat link email). null = belum terverifikasi. Akun yang sudah ada
     * sebelum fitur ini di-backfill di migrasinya.
     */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /**
     * Akses ke `/admin` (verifikasi pembayaran PRO, metrik). Default false —
     * cuma diaktifkan manual lewat DB (`pnpm db:studio`) oleh pemilik app,
     * bukan lewat UI, supaya nggak ada jalur self-service jadi admin.
     */
    isAdmin: boolean('is_admin').notNull().default(false),
    /**
     * Brand tempat akun ini bergabung (satu akun = satu brand). RESTRICT: brand
     * tidak bisa dihapus selama masih ada akun di dalamnya — hapus akunnya dulu.
     */
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    /**
     * Peran di brand. Default `owner`: akun yang mendaftar sendiri adalah
     * pemilik brand barunya. `admin` hanya lewat undangan (`brand_invitations`).
     */
    brandRole: brandRoleEnum('brand_role').notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('users_brand_idx').on(table.brandId),
    // Satu brand = satu pemilik. Tukar pemilik: turunkan yang lama jadi `admin`
    // dulu, baru naikkan yang baru (dalam satu transaksi).
    uniqueIndex('users_one_owner_per_brand')
      .on(table.brandId)
      .where(sql`${table.brandRole} = 'owner'`),
  ],
)

// UNDANGAN ADMIN BRAND
// Pemilik mengundang lewat email. Yang disimpan cuma hash token (sha256), bukan
// token mentahnya — sama polanya dengan reset sandi & verifikasi email. Undangan
// hanya untuk email yang BELUM punya akun: penerima mendaftar lewat tautan
// undangan dan langsung jadi admin brand ini (bukan owner brand baru).
export const brandInvitations = pgTable(
  'brand_invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** Selalu huruf kecil (dijaga di kode dan oleh check di bawah). */
    email: varchar().notNull(),
    /** Peran yang diberikan saat diterima. Tidak boleh `owner`. */
    role: brandRoleEnum().notNull().default('admin'),
    tokenHash: varchar('token_hash').notNull().unique(),
    status: brandInvitationStatusEnum().notNull().default('pending'),
    /** Pengundang & penerima: dikosongkan kalau akunnya dihapus. */
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedBy: uuid('accepted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('brand_invitations_brand_status_idx').on(table.brandId, table.status),
    // Satu undangan pending per email per brand. Undangan pending yang sudah
    // lewat masa berlaku diubah ke `expired` dulu sebelum mengundang ulang.
    uniqueIndex('brand_invitations_pending_email_unique')
      .on(table.brandId, table.email)
      .where(sql`${table.status} = 'pending'`),
    check(
      'brand_invitations_email_lowercase',
      sql`${table.email} = lower(${table.email})`,
    ),
    check('brand_invitations_role_not_owner', sql`${table.role} <> 'owner'`),
  ],
)

export const sessions = pgTable('sessions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar().notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// PASSWORD RESET
// Yang disimpan cuma hash token (sha256), bukan token mentahnya — sama pola
// dengan password_hash: kalau DB bocor, token-nya tetap nggak bisa dipakai.
// Token sekali pakai (used_at) dan punya masa berlaku (expires_at).
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Diisi kalau token sudah dipakai buat ganti kata sandi, ATAU dihanguskan
  // karena user minta link baru (yang berlaku cuma token terbaru).
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Token verifikasi email. Polanya sama dengan password_reset_tokens: yang
// disimpan cuma hash-nya, sekali pakai (used_at), dan punya masa berlaku.
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// FEE RULES (Manajemen Fee)
export const feeRules = pgTable(
  'fee_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** "Dibuat oleh". Boleh kosong: data milik brand, bukan akun pembuatnya. */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: varchar().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('fee_rules_brand_idx').on(table.brandId)],
)

// Overlap between tiers of the same fee_rule is validated in the application/server layer.
export const feeTiers = pgTable('fee_tiers', {
  id: uuid().primaryKey().defaultRandom(),
  feeRuleId: uuid('fee_rule_id')
    .notNull()
    .references(() => feeRules.id, { onDelete: 'cascade' }),
  minPrice: decimal('min_price', { precision: 12, scale: 2 }).notNull(),
  maxPrice: decimal('max_price', { precision: 12, scale: 2 }).notNull(),
  feeAmount: decimal('fee_amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// CUSTOMERS (untuk autocomplete Nama Pelanggan saat tambah pesanan)
export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** "Dibuat oleh". Boleh kosong: data milik brand, bukan akun pembuatnya. */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: varchar().notNull(),
    phone: varchar(),
    /** Alamat customer (opsional), diisi manual di Profil → Customer. */
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('customers_brand_idx').on(table.brandId)],
)

// PAYMENT METHODS (Profil → Pembayaran): bank, e-wallet, atau QRIS.
// Satu user bisa punya banyak metode; yang tampil di invoice/tagih cuma yang
// is_active = true. QRIS disimpan sebagai gambar (data URL base64), bank/wallet
// pakai provider + nomor rekening/akun.
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** "Dibuat oleh". Boleh kosong: data milik brand, bukan akun pembuatnya. */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: paymentMethodTypeEnum('type').notNull(),
    provider: varchar().notNull(), // "BCA", "GoPay", "QRIS"
    accountNumber: varchar('account_number'), // no. rekening / no. HP wallet
    accountName: varchar('account_name'), // atas nama (opsional)
    qrisImage: text('qris_image'), // data URL base64 (image/png|jpeg|webp)
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('payment_methods_brand_idx').on(table.brandId)],
)

// SUBSCRIPTIONS (histori langganan PRO) — pembayaran manual, diverifikasi admin.
// Satu baris = satu pengajuan/pembelian. Karena histori, barisnya TIDAK
// ditimpa: perpanjangan bikin baris baru, dan status lamanya jadi `expired`.
// Info pembayaran ikut disimpan di sini (nominal, metode, nama pengirim,
// referensi, bukti transfer) supaya audit bisa dicek tanpa tabel lain.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Siapa yang mengajukan. Boleh kosong: langganan milik brand. */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** Kode paket — lihat PRO_PLAN_CODE. */
    planCode: varchar('plan_code').notNull().default(PRO_PLAN_CODE),
    status: subscriptionStatusEnum().notNull().default('pending'),
    /** Durasi yang dibeli, disimpan sebagai snapshot (30 hari = PRO_DURATION_DAYS). */
    durationDays: integer('duration_days').notNull().default(PRO_DURATION_DAYS),
    /** Diisi saat status jadi `active`: awal & akhir masa PRO. */
    startedAt: timestamp('started_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // --- Info pembayaran (diisi user saat mengajukan) ---
    amount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    /** Cara bayar yang dipakai user: bank, e-wallet, atau QRIS. */
    paymentMethod: paymentMethodTypeEnum('payment_method'),
    /** Nama bank/e-wallet-nya, mis. "BCA", "GoPay". */
    paymentProvider: varchar('payment_provider'),
    /** Nama di rekening pengirim, buat dicocokkan admin. */
    paymentSenderName: varchar('payment_sender_name'),
    /** No. referensi/berita transfer atau 4 digit terakhir, opsional. */
    paymentReference: varchar('payment_reference'),
    /**
     * Bukti transfer LAMA sebagai data URL base64. Pengajuan baru TIDAK mengisi
     * kolom ini: filenya di Netlify Blobs (store `payment-proofs`, key = id
     * baris ini) dan `paymentProofStored` = true. Kolom ini dipertahankan supaya
     * bukti lama tetap terbaca.
     */
    paymentProofImage: text('payment_proof_image'),
    /** true = bukti transfer ada di Blobs (lihat `src/lib/storage.ts`). */
    paymentProofStored: boolean('payment_proof_stored')
      .notNull()
      .default(false),
    /** Catatan dari user, mis. "transfer dari rekening istri". */
    paymentNote: text('payment_note'),
    /** Tanggal user mengaku transfer. */
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // --- Hasil verifikasi manual admin (diisi di fase admin) ---
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscriptions_user_created_idx').on(table.userId, table.createdAt),
    index('subscriptions_brand_created_idx').on(table.brandId, table.createdAt),
    index('subscriptions_status_idx').on(table.status),
    // Maksimal satu pengajuan `pending` per BRAND (semua anggota brand berbagi
    // satu langganan). Yang per-user di bawah dibiarkan sampai tahap contract.
    uniqueIndex('subscriptions_pending_per_brand_unique')
      .on(table.brandId)
      .where(sql`${table.status} = 'pending'`),
    // Maksimal satu pengajuan `pending` per user: cegah kirim bukti transfer
    // dobel sebelum yang lama diproses admin.
    uniqueIndex('subscriptions_pending_per_user_unique')
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    check('subscriptions_amount_non_negative', sql`${table.amount} >= 0`),
    check(
      'subscriptions_period_order',
      sql`${table.startedAt} is null or ${table.endsAt} is null or ${table.endsAt} >= ${table.startedAt}`,
    ),
  ],
)

// EVENTS
export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** "Dibuat oleh". Boleh kosong: data milik brand, bukan akun pembuatnya. */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    feeRuleId: uuid('fee_rule_id').references(() => feeRules.id, {
      onDelete: 'set null',
    }),
    /**
     * Event kalender yang diikuti brand ini lewat tombol "Ikut Event". Null =
     * event buatan sendiri. SET NULL: kalau admin menghapus event kalender,
     * event belanja jastiper tetap utuh, hanya tautannya yang putus.
     */
    calendarEventId: uuid('calendar_event_id').references(
      () => calendarEvents.id,
      { onDelete: 'set null' },
    ),
    name: varchar().notNull(),
    description: text(),
    eventDate: timestamp('event_date', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    /**
     * Event nonaktif = event yang sudah selesai/ditutup: disembunyikan dari daftar
     * "Event aktif" di beranda dan tidak bisa ditambah pesanan baru, tapi semua
     * data pesanan/tagihannya tetap utuh dan bisa diaktifkan lagi kapan saja.
     * Diatur dari menu ⋮ di halaman Detail Event.
     */
    isActive: boolean('is_active').notNull().default(true),
    /**
     * Kalau aktif, invoice/tagihan ke pelanggan tidak menampilkan rincian fee:
     * daftar barang cukup menampilkan qty + harga nett (harga asli + fee) per
     * unit, tanpa memecah "harga + fee". Total tagihan tetap sama, hanya cara
     * menampilkannya yang berubah. Diatur dari menu ⋮ di halaman Detail Event.
     */
    hideFee: boolean('hide_fee').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('events_brand_idx').on(table.brandId),
    index('events_calendar_event_idx').on(table.calendarEventId),
    // Satu brand hanya boleh ikut satu kali di tiap event kalender. Dijaga di
    // DB (bukan cuma di kode) supaya dobel klik / dua perangkat tidak bikin
    // event belanja ganda.
    uniqueIndex('events_brand_calendar_event_unique')
      .on(table.brandId, table.calendarEventId)
      .where(sql`${table.calendarEventId} is not null`),
  ],
)

// ORDERS & ITEMS
export const orders = pgTable('orders', {
  id: uuid().primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  customerName: varchar('customer_name').notNull(),
  customerPhone: varchar('customer_phone'),
  paymentStatus: paymentStatusEnum('payment_status')
    .notNull()
    .default('unpaid'),
  /** Nominal yang sudah dibayar pelanggan (untuk DP). 0 = belum bayar. */
  paidAmount: decimal('paid_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Fee is stored per-item (not recalculated) so past transactions stay
// unchanged if fee_tiers are edited/removed later. `fee` berlaku PER UNIT:
// total baris = (original_price + fee) * qty.
export const items = pgTable('items', {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  name: varchar().notNull(),
  originalPrice: decimal('original_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  fee: decimal({ precision: 12, scale: 2 }).notNull(),
  qty: integer().notNull().default(1),
  // Checklist belanja (live shopping): true = barang sudah didapat/dibeli di toko.
  obtained: boolean().notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ACTIVITY LOGS
export const activityLogs = pgTable('activity_logs', {
  id: uuid().primaryKey().defaultRandom(),
  /** "Dibuat oleh". Boleh kosong: data milik brand, bukan akun pembuatnya. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  action: varchar().notNull(),
  entityType: varchar('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  metadata: jsonb(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// RELATIONS

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  feeRules: many(feeRules),
  events: many(events),
  activityLogs: many(activityLogs),
  customers: many(customers),
  paymentMethods: many(paymentMethods),
  subscriptions: many(subscriptions),
}))

// Histori langganan milik user. Admin yang memverifikasi (`reviewedBy`) sengaja
// tidak dibuatkan relation supaya relasi user <-> subscriptions tetap satu arah
// dan tidak ambigu waktu dipakai di `db.query`.
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}))

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  user: one(users, { fields: [paymentMethods.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
)

export const feeRulesRelations = relations(feeRules, ({ one, many }) => ({
  user: one(users, { fields: [feeRules.userId], references: [users.id] }),
  tiers: many(feeTiers),
  events: many(events),
}))

export const feeTiersRelations = relations(feeTiers, ({ one }) => ({
  feeRule: one(feeRules, {
    fields: [feeTiers.feeRuleId],
    references: [feeRules.id],
  }),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, { fields: [events.userId], references: [users.id] }),
  feeRule: one(feeRules, {
    fields: [events.feeRuleId],
    references: [feeRules.id],
  }),
  orders: many(orders),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  event: one(events, { fields: [orders.eventId], references: [events.id] }),
  items: many(items),
}))

export const itemsRelations = relations(items, ({ one }) => ({
  order: one(orders, { fields: [items.orderId], references: [orders.id] }),
}))

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}))

export const customersRelations = relations(customers, ({ one }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
}))

/**
 * Event kalender: daftar acara jastip (bazar, pameran, PO, dll) yang ditampilkan
 * di tab "Event". Beda dari `events` di atas (batch belanja milik brand):
 * tabel ini GLOBAL — diinput admin ALAKA dan terlihat oleh semua brand, jadi
 * tidak punya `brand_id`. Fitur gratis (tidak dikunci PRO).
 *
 * `event_date` bertipe `date` (tanggal kalender polos, tanpa jam/zona), bukan
 * `timestamptz`: yang dibutuhkan kalender hanya "tanggal berapa", dan dengan
 * begitu tidak ada risiko tanggal bergeser sehari akibat konversi zona waktu.
 */
export const calendarEvents = pgTable(
  'calendar_event',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar().notNull(),
    location: varchar().notNull(),
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    /**
     * Tanggal terakhir event (inklusif), format `YYYY-MM-DD`. Null = event
     * sehari (berakhir di `event_date`). Event masih dianggap berjalan sampai
     * 23.59 WIB di tanggal ini; dipakai juga sebagai rentang di kartu event.
     */
    endDate: date('end_date', { mode: 'string' }),
    /**
     * Event online (PO lewat website/chat, tanpa tempat fisik) atau offline.
     * Diatur admin lewat toggle; dipakai filter Lokasi di tab Event user.
     */
    isOnline: boolean('is_online').notNull().default(false),
    /**
     * Diisi saat admin menekan "Akhiri event". Non-null = event sudah
     * diakhiri: hilang dari daftar user walau tanggalnya belum lewat, dan
     * bisa dibuka kembali (kolom dikosongkan lagi).
     */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Deskripsi event di halaman detail. Boleh kosong. */
    description: text(),
    /**
     * Penanda banner, sama polanya dengan `brands.avatar_updated_at`: filenya
     * ada di Netlify Blobs (store `calendar-banners`, key = id event), kolom ini
     * cuma menandai KAPAN terakhir diganti. Null = belum ada banner. Dipakai
     * juga sebagai `?v=` di URL gambar supaya cache browser ikut ganti.
     * Diisi dari UI admin (batch berikutnya).
     */
    bannerUpdatedAt: timestamp('banner_updated_at', { withTimezone: true }),
    /**
     * Brand yang dipamerkan di event ini, berupa nama bebas (mis. brand skincare
     * yang ikut bazar) — BUKAN relasi ke tabel `brands` (itu brand jastiper).
     */
    exhibitors: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Admin ALAKA yang menginput. Boleh kosong (mis. data seed). */
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * Partner pemilik event (dibuat lewat Partner Portal). Null = event buatan
     * admin ALAKA. SET NULL: kalau partnernya dihapus, event dan jastiper yang
     * sudah ikut tetap utuh — eventnya menjadi event milik admin.
     */
    partnerId: uuid('partner_id').references(() => partners.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('calendar_event_date_idx').on(table.eventDate),
    index('calendar_event_partner_idx').on(table.partnerId),
  ],
)

export const subscriptionSettings = pgTable('subscription_settings', {
  id: uuid().primaryKey().defaultRandom(),
  qrisImage: text('qris_image'), // data URL base64, sama pola dengan payment_methods.qris_image
  /**
   * Payload QRIS statis mentah (string EMVCo MPM), disimpan agar bisa dikonversi
   * ke QRIS dinamis dengan nominal `proPrice` di sisi client saat member membuka
   * modal upgrade. Nullable: admin lama yang belum upload ulang tetap jalan lewat
   * fallback qrisImage statis.
   */
  qrisString: text('qris_string'),
  /** Harga membership PRO saat ini. Di-snapshot ke subscriptions.amount tiap kali ada pengajuan baru. */
  proPrice: decimal('pro_price', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  /**
   * Harga awal (dicoret) untuk menampilkan diskon ke member. Murni tampilan:
   * nominal yang ditransfer tetap `proPrice`. Null = tidak ada harga coret.
   */
  originalPrice: decimal('original_price', { precision: 12, scale: 2 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
})

export const subscriptionSettingsRelations = relations(
  subscriptionSettings,
  ({ one }) => ({
    updatedByUser: one(users, {
      fields: [subscriptionSettings.updatedBy],
      references: [users.id],
    }),
  }),
)

export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
)

// PARTNER PORTAL
// Partner = brand/penyelenggara yang memamerkan produk di event kalender dan
// mengelola katalog + event-nya sendiri lewat `/partner`. Akunnya SENGAJA
// terpisah dari `users` (yang selalu terikat ke satu brand jastiper lewat
// `users.brand_id NOT NULL`): satu partner = satu login, jadi semua alur akun
// jastiper (trial, langganan, tim, data bisnis) tidak tersentuh. Login-nya
// tetap lewat halaman `/login` yang sama (lihat `loginUser`).
//
// Email partner TIDAK boleh sama dengan email di `users` — dijaga di kode
// (`partner-queries.ts`, `registerUser`, callback Google, undangan admin brand).
export const partners = pgTable(
  'partners',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar().notNull(),
    /** Email login. Selalu huruf kecil (dijaga check di bawah). */
    email: varchar().notNull().unique(),
    /** Null = undangan belum diterima (kata sandi belum dibuat). */
    passwordHash: varchar('password_hash'),
    /** Nomor WhatsApp partner (format lokal). Opsional. */
    waNumber: varchar('wa_number'),
    /** Kapan undangan diterima & kata sandi dibuat. Null = masih "Diundang". */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /**
     * Dinonaktifkan admin. Terisi = tidak bisa login/atur ulang/terima undangan
     * dan semua sesinya dimatikan; datanya (produk, event) tetap utuh dan bisa
     * diaktifkan lagi. Null = normal.
     */
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    /**
     * Katalog PDF partner (satu berkas per partner, tampil di halaman semua
     * event miliknya). Berkasnya di Netlify Blobs dengan key = id partner;
     * kolom ini hanya metadata. Semua null = belum ada katalog.
     */
    catalogPdfName: varchar('catalog_pdf_name'),
    catalogPdfSize: integer('catalog_pdf_size'),
    catalogPdfUpdatedAt: timestamp('catalog_pdf_updated_at', {
      withTimezone: true,
    }),
    /** Admin ALAKA yang mendaftarkan. Dikosongkan kalau akunnya dihapus. */
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'partners_email_lowercase',
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
)

// Sesi login partner (cookie terpisah dari sesi jastiper/admin).
export const partnerSessions = pgTable(
  'partner_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    token: varchar().notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('partner_sessions_partner_idx').on(table.partnerId)],
)

// Token undangan partner: hanya hash sha256 yang disimpan (pola sama dengan
// `brand_invitations`), sekali pakai (`used_at`), punya masa berlaku. Dipakai
// juga untuk "kirim ulang undangan": token lama dihanguskan, token baru dibuat.
export const partnerInvitationTokens = pgTable(
  'partner_invitation_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('partner_invitation_tokens_partner_idx').on(table.partnerId),
  ],
)

// Katalog produk milik partner. Dikelola partner sendiri lewat `/partner/katalog`.
// Harga dalam rupiah (decimal 12,2 seperti kolom harga lain). Produk tidak
// dihapus, cukup dinonaktifkan (`is_active = false`): nanti produk dipakai di
// event, jadi baris yang sudah terpakai tidak boleh hilang.
export const partnerProducts = pgTable(
  'partner_products',
  {
    id: uuid().primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    name: varchar().notNull(),
    /** Kode/SKU buatan partner. Opsional dan tidak harus unik. */
    code: varchar(),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    description: text(),
    isActive: boolean('is_active').notNull().default(true),
    /** Kapan foto terakhir diganti; null = belum ada foto. Dipakai sebagai `?v=`. */
    photoUpdatedAt: timestamp('photo_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('partner_products_partner_idx').on(table.partnerId),
    check('partner_products_price_nonneg', sql`${table.price} >= 0`),
  ],
)

// Produk yang dibawa partner ke satu event. Partner memilih sebagian dari
// katalognya sendiri untuk tiap event (tab "Produk" di detail event). Baris ikut
// terhapus bersama event atau produknya, jadi tidak ada tautan yatim. Harga
// selalu harga katalog — belum ada harga khusus per event.
export const partnerEventProducts = pgTable(
  'partner_event_products',
  {
    calendarEventId: uuid('calendar_event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => partnerProducts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.calendarEventId, table.productId] }),
    index('partner_event_products_product_idx').on(table.productId),
  ],
)

// Token atur ulang kata sandi PARTNER. Pola sama dengan `password_reset_tokens`
// (hanya hash sha256 yang disimpan, sekali pakai, ada masa berlaku), dipisah
// karena akun partner ada di tabel sendiri. `used_at` juga dipakai untuk
// menghanguskan token lama saat partner meminta link baru — barisnya TIDAK
// dihapus, supaya hitungan batas permintaan per jendela waktu tetap benar.
export const partnerPasswordResetTokens = pgTable(
  'partner_password_reset_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('partner_password_reset_tokens_partner_idx').on(table.partnerId),
  ],
)
