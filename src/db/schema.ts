import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

// USERS & AUTH
// Trial 30 hari mulai dari saat user dibuat. Nilai trial diisi DEFAULT kolom di
// database (bukan diset manual di kode) supaya SEMUA jalur pembuatan user —
// register email, Google OAuth, seed script — otomatis kebagian trial yang sama.
// Masa trial & langganan PRO sengaja TIDAK disimpan sebagai satu flag di tabel
// ini: status akses dihitung di `src/lib/subscription.ts` dari kolom trial di
// bawah + histori di tabel `subscriptions`.
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar().notNull(),
    brandName: varchar('brand_name'),
    waMessageTemplate: text('wa_message_template'),
    email: varchar().notNull().unique(),
    passwordHash: varchar('password_hash'),
    googleId: varchar('google_id').unique(),
    /**
     * Akses ke `/admin` (verifikasi pembayaran PRO, metrik). Default false —
     * cuma diaktifkan manual lewat DB (`pnpm db:studio`) oleh pemilik app,
     * bukan lewat UI, supaya nggak ada jalur self-service jadi admin.
     */
    isAdmin: boolean('is_admin').notNull().default(false),
    /** Awal masa trial (= waktu user dibuat). */
    trialStartedAt: timestamp('trial_started_at').notNull().defaultNow(),
    /** Akhir masa trial (trial_started_at + TRIAL_DAYS hari). */
    trialEndsAt: timestamp('trial_ends_at')
      .notNull()
      .default(sql`now() + interval '${sql.raw(String(TRIAL_DAYS))} days'`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'users_trial_period_order',
      sql`${table.trialEndsAt} >= ${table.trialStartedAt}`,
    ),
  ],
)

export const sessions = pgTable('sessions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar().notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
  expiresAt: timestamp('expires_at').notNull(),
  // Diisi kalau token sudah dipakai buat ganti kata sandi, ATAU dihanguskan
  // karena user minta link baru (yang berlaku cuma token terbaru).
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// FEE RULES (Manajemen Fee)
export const feeRules = pgTable('fee_rules', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Overlap between tiers of the same fee_rule is validated in the application/server layer.
export const feeTiers = pgTable('fee_tiers', {
  id: uuid().primaryKey().defaultRandom(),
  feeRuleId: uuid('fee_rule_id')
    .notNull()
    .references(() => feeRules.id, { onDelete: 'cascade' }),
  minPrice: decimal('min_price', { precision: 12, scale: 2 }).notNull(),
  maxPrice: decimal('max_price', { precision: 12, scale: 2 }).notNull(),
  feeAmount: decimal('fee_amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// CUSTOMERS (untuk autocomplete Nama Pelanggan saat tambah pesanan)
export const customers = pgTable('customers', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar().notNull(),
  phone: varchar(),
  /** Alamat customer (opsional), diisi manual di Profil → Customer. */
  address: text('address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
})

// PAYMENT METHODS (Profil → Pembayaran): bank, e-wallet, atau QRIS.
// Satu user bisa punya banyak metode; yang tampil di invoice/tagih cuma yang
// is_active = true. QRIS disimpan sebagai gambar (data URL base64), bank/wallet
// pakai provider + nomor rekening/akun.
export const paymentMethods = pgTable('payment_methods', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: paymentMethodTypeEnum('type').notNull(),
  provider: varchar().notNull(), // "BCA", "GoPay", "QRIS"
  accountNumber: varchar('account_number'), // no. rekening / no. HP wallet
  accountName: varchar('account_name'), // atas nama (opsional)
  qrisImage: text('qris_image'), // data URL base64 (image/png|jpeg|webp)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// SUBSCRIPTIONS (histori langganan PRO) — pembayaran manual, diverifikasi admin.
// Satu baris = satu pengajuan/pembelian. Karena histori, barisnya TIDAK
// ditimpa: perpanjangan bikin baris baru, dan status lamanya jadi `expired`.
// Info pembayaran ikut disimpan di sini (nominal, metode, nama pengirim,
// referensi, bukti transfer) supaya audit bisa dicek tanpa tabel lain.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Kode paket — lihat PRO_PLAN_CODE. */
    planCode: varchar('plan_code').notNull().default(PRO_PLAN_CODE),
    status: subscriptionStatusEnum().notNull().default('pending'),
    /** Durasi yang dibeli, disimpan sebagai snapshot (30 hari = PRO_DURATION_DAYS). */
    durationDays: integer('duration_days').notNull().default(PRO_DURATION_DAYS),
    /** Diisi saat status jadi `active`: awal & akhir masa PRO. */
    startedAt: timestamp('started_at'),
    endsAt: timestamp('ends_at'),
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
    /** Bukti transfer sebagai data URL base64 (pola sama dengan qris_image). */
    paymentProofImage: text('payment_proof_image'),
    /** Catatan dari user, mis. "transfer dari rekening istri". */
    paymentNote: text('payment_note'),
    /** Tanggal user mengaku transfer. */
    paidAt: timestamp('paid_at'),
    // --- Hasil verifikasi manual admin (diisi di fase admin) ---
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('subscriptions_user_created_idx').on(table.userId, table.createdAt),
    index('subscriptions_status_idx').on(table.status),
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
export const events = pgTable('events', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  feeRuleId: uuid('fee_rule_id').references(() => feeRules.id, {
    onDelete: 'set null',
  }),
  name: varchar().notNull(),
  description: text(),
  eventDate: timestamp('event_date', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ACTIVITY LOGS
export const activityLogs = pgTable('activity_logs', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: varchar().notNull(),
  entityType: varchar('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  metadata: jsonb(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// RELATIONS

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
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

export const subscriptionSettings = pgTable('subscription_settings', {
  id: uuid().primaryKey().defaultRandom(),
  qrisImage: text('qris_image'), // data URL base64, sama pola dengan payment_methods.qris_image
  /** Harga membership PRO saat ini. Di-snapshot ke subscriptions.amount tiap kali ada pengajuan baru. */
  proPrice: decimal('pro_price', { precision: 12, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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