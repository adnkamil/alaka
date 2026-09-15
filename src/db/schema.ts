import { relations } from 'drizzle-orm'
import {
  decimal,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'paid',
  'shipped',
])

// USERS & AUTH
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar().notNull(),
  brandName: varchar('brand_name'),
  bankName: varchar('bank_name'),
  bankAccountNumber: varchar('bank_account_number'),
  waMessageTemplate: text('wa_message_template'),
  email: varchar().notNull().unique(),
  passwordHash: varchar('password_hash'),
  googleId: varchar('google_id').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
})

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Fee is stored per-item (not recalculated) so past transactions stay
// unchanged if fee_tiers are edited/removed later.
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
