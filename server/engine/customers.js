// 客户业务引擎：CRUD + 历史订单 + 累计口径（S5）
import { httpError } from './errors.js';
import { reqString, optString, reqEnum } from './validate.js';
import { audit } from './audit.js';

export const CUSTOMER_TYPES = ['brand', 'agency', 'platform'];

const COLS = `id, name, type, wechat, note, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;

export function getCustomerOrThrow(db, id) {
  const row = db.prepare(`SELECT ${COLS} FROM customers WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!row) throw httpError(404, 'not_found', '客户不存在');
  return row;
}

export function createCustomer(db, input, actorId) {
  const name = reqString(input.name, '客户名称');
  const type = reqEnum(input.type, CUSTOMER_TYPES, '客户类型');
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO customers (name, type, wechat, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(name, type, optString(input.wechat), optString(input.note), now, now);
  audit(db, { userId: actorId, action: 'customer.create', targetType: 'customer', targetId: info.lastInsertRowid, detail: { name, type } });
  return getCustomerOrThrow(db, Number(info.lastInsertRowid));
}

export function customerTotals(db, customerId) {
  return db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS totalCents, COUNT(*) AS orderCount, MAX(published_at) AS lastOrderAt
     FROM ad_orders WHERE customer_id = ? AND deleted_at IS NULL`,
  ).get(customerId);
}

export function listCustomers(db, { type } = {}) {
  const conds = ['deleted_at IS NULL'];
  const params = [];
  if (type) { reqEnum(type, CUSTOMER_TYPES, '客户类型'); conds.push('type = ?'); params.push(type); }
  const rows = db.prepare(`SELECT ${COLS} FROM customers WHERE ${conds.join(' AND ')} ORDER BY id`).all(...params);
  return rows.map((r) => ({ ...r, totals: customerTotals(db, r.id) }));
}

export function getCustomerDetail(db, id) {
  const customer = getCustomerOrThrow(db, id);
  return {
    ...customer,
    totals: customerTotals(db, id),
    orders: db.prepare(
      `SELECT o.id, o.account_id AS accountId, a.name AS accountName, o.brand, o.product, o.brief,
              o.amount_cents AS amountCents, o.channel, o.published_at AS publishedAt, o.created_at AS createdAt
       FROM ad_orders o JOIN accounts a ON a.id = o.account_id
       WHERE o.customer_id = ? AND o.deleted_at IS NULL ORDER BY o.published_at DESC`,
    ).all(id),
  };
}

export function updateCustomer(db, id, patch, actorId) {
  getCustomerOrThrow(db, id);
  const sets = [];
  const params = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(reqString(patch.name, '客户名称')); }
  if (patch.type !== undefined) { sets.push('type = ?'); params.push(reqEnum(patch.type, CUSTOMER_TYPES, '客户类型')); }
  if (patch.wechat !== undefined) { sets.push('wechat = ?'); params.push(optString(patch.wechat)); }
  if (patch.note !== undefined) { sets.push('note = ?'); params.push(optString(patch.note)); }
  if (sets.length === 0) throw httpError(400, 'bad_request', '无可更新字段');
  sets.push('updated_at = ?');
  params.push(Date.now(), id);
  db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(db, { userId: actorId, action: 'customer.update', targetType: 'customer', targetId: id, detail: patch });
  return getCustomerOrThrow(db, id);
}

export function softDeleteCustomer(db, id, actorId) {
  getCustomerOrThrow(db, id);
  db.prepare('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  audit(db, { userId: actorId, action: 'customer.delete', targetType: 'customer', targetId: id });
}
