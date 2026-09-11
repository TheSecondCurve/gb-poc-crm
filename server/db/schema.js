// Drizzle 表结构定义（唯一真相源，drizzle-kit 据此生成迁移）。
// 约定：列名 snake_case；金额一律分（*_cents INTEGER）；时间 epoch 毫秒 INTEGER；
// 软删 deleted_at；事实表双时间戳（created_at + 业务日期）。
// PRAGMA（WAL/busy_timeout/foreign_keys）只在连接层设置（server/db/index.js），不写进 migration。
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  disabledAt: integer('disabled_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [uniqueIndex('users_username_unique').on(t.username)]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const patTokens = sqliteTable('pat_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  prefix: text('prefix').notNull(),
  scope: text('scope', { enum: ['read', 'write'] }).notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  revokedBy: integer('revoked_by').references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (t) => [uniqueIndex('pat_tokens_hash_unique').on(t.tokenHash)]);

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  status: text('status', { enum: ['warming', 'active', 'sealed'] }).notNull().default('warming'),
  purchasedAt: integer('purchased_at'),
  ownerId: integer('owner_id').references(() => users.id),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [index('accounts_category_idx').on(t.category), index('accounts_owner_idx').on(t.ownerId)]);

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', { enum: ['brand', 'agency', 'platform'] }).notNull(),
  wechat: text('wechat'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const adOrders = sqliteTable('ad_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  brand: text('brand'),
  product: text('product'),
  brief: text('brief'),
  amountCents: integer('amount_cents').notNull(),
  channel: text('channel', { enum: ['private', 'platform'] }).notNull(),
  publishedAt: integer('published_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('ad_orders_account_idx').on(t.accountId),
  index('ad_orders_customer_idx').on(t.customerId),
  index('ad_orders_published_idx').on(t.publishedAt),
]);

export const accountInvestments = sqliteTable('account_investments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  type: text('type', { enum: ['purchase', 'traffic'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  spentAt: integer('spent_at').notNull(),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('account_investments_account_idx').on(t.accountId),
  index('account_investments_spent_idx').on(t.spentAt),
]);

export const operatingExpenses = sqliteTable('operating_expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category', { enum: ['salary', 'office', 'other'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  spentAt: integer('spent_at').notNull(),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [index('operating_expenses_spent_idx').on(t.spentAt)]);

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detail: text('detail'),
  createdAt: integer('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
