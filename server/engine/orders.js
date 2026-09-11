// 广告订单业务引擎：S3 登记（可同流程新建客户）、CRUD、软删
import { httpError } from './errors.js';
import { optString, reqPositiveCents, reqEnum, reqTs, optId } from './validate.js';
import { audit } from './audit.js';
import { createCustomer } from './customers.js';

export const ORDER_CHANNELS = ['private', 'platform'];

const COLS = `id, account_id AS accountId, customer_id AS customerId, brand, product, brief,
  amount_cents AS amountCents, channel, published_at AS publishedAt,
  created_at AS createdAt, updated_at AS updatedAt, updated_by AS updatedBy, deleted_at AS deletedAt`;

export function getOrderOrThrow(db, id) {
  const row = db.prepare(`SELECT ${COLS} FROM ad_orders WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!row) throw httpError(404, 'not_found', '订单不存在');
  return row;
}

function assertAccount(db, accountId) {
  const row = db.prepare('SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL').get(accountId);
  if (!row) throw httpError(400, 'bad_request', '账号不存在');
}

function assertCustomer(db, customerId) {
  const row = db.prepare('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL').get(customerId);
  if (!row) throw httpError(400, 'bad_request', '客户不存在');
}

// S3：customerId 与 newCustomer 二选一；newCustomer 在同一事务里顺手新建
export function createOrder(db, input, actorId) {
  const accountId = optId(input.accountId);
  if (accountId == null) throw httpError(400, 'bad_request', '账号必填');
  assertAccount(db, accountId);
  const amountCents = reqPositiveCents(input.amountCents, '金额');
  const channel = reqEnum(input.channel, ORDER_CHANNELS, '来源渠道');
  const publishedAt = reqTs(input.publishedAt, '发布日期');

  let customerId = optId(input.customerId);
  if (customerId == null && input.newCustomer == null) throw httpError(400, 'bad_request', '客户必填（customerId 或 newCustomer）');

  const now = Date.now();
  const id = db.transaction(() => {
    if (customerId == null) {
      customerId = createCustomer(db, input.newCustomer, actorId).id;
    } else {
      assertCustomer(db, customerId);
    }
    const info = db.prepare(
      `INSERT INTO ad_orders (account_id, customer_id, brand, product, brief, amount_cents, channel, published_at, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(accountId, customerId, optString(input.brand), optString(input.product), optString(input.brief),
      amountCents, channel, publishedAt, now, now, actorId);
    return Number(info.lastInsertRowid);
  })();

  audit(db, { userId: actorId, action: 'order.create', targetType: 'ad_order', targetId: id, detail: { accountId, customerId, amountCents } });
  return getOrderOrThrow(db, id);
}

export function listOrders(db, { accountId, customerId, channel, from, to } = {}) {
  const conds = ['deleted_at IS NULL'];
  const params = [];
  if (accountId) { conds.push('account_id = ?'); params.push(Number(accountId)); }
  if (customerId) { conds.push('customer_id = ?'); params.push(Number(customerId)); }
  if (channel) { reqEnum(channel, ORDER_CHANNELS, '来源渠道'); conds.push('channel = ?'); params.push(channel); }
  if (from) { conds.push('published_at >= ?'); params.push(Number(from)); }
  if (to) { conds.push('published_at < ?'); params.push(Number(to)); }
  return db.prepare(`SELECT ${COLS} FROM ad_orders WHERE ${conds.join(' AND ')} ORDER BY published_at DESC`).all(...params);
}

export function updateOrder(db, id, patch, actorId) {
  getOrderOrThrow(db, id);
  const sets = [];
  const params = [];
  if (patch.accountId !== undefined) {
    const accountId = optId(patch.accountId);
    assertAccount(db, accountId);
    sets.push('account_id = ?'); params.push(accountId);
  }
  if (patch.customerId !== undefined) {
    const customerId = optId(patch.customerId);
    assertCustomer(db, customerId);
    sets.push('customer_id = ?'); params.push(customerId);
  }
  if (patch.amountCents !== undefined) { sets.push('amount_cents = ?'); params.push(reqPositiveCents(patch.amountCents, '金额')); }
  if (patch.channel !== undefined) { sets.push('channel = ?'); params.push(reqEnum(patch.channel, ORDER_CHANNELS, '来源渠道')); }
  if (patch.publishedAt !== undefined) { sets.push('published_at = ?'); params.push(reqTs(patch.publishedAt, '发布日期')); }
  if (patch.brand !== undefined) { sets.push('brand = ?'); params.push(optString(patch.brand)); }
  if (patch.product !== undefined) { sets.push('product = ?'); params.push(optString(patch.product)); }
  if (patch.brief !== undefined) { sets.push('brief = ?'); params.push(optString(patch.brief)); }
  if (sets.length === 0) throw httpError(400, 'bad_request', '无可更新字段');
  sets.push('updated_at = ?', 'updated_by = ?');
  params.push(Date.now(), actorId, id);
  db.prepare(`UPDATE ad_orders SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(db, { userId: actorId, action: 'order.update', targetType: 'ad_order', targetId: id, detail: patch });
  return getOrderOrThrow(db, id);
}

export function softDeleteOrder(db, id, actorId) {
  getOrderOrThrow(db, id);
  db.prepare('UPDATE ad_orders SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
    .run(Date.now(), Date.now(), actorId, id);
  audit(db, { userId: actorId, action: 'order.delete', targetType: 'ad_order', targetId: id });
}
