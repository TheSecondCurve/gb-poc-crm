// 账号业务引擎：S1 建档（同事务生成买入投入记录）、CRUD、软删
import { httpError } from './errors.js';
import { reqString, optString, reqPositiveCents, reqEnum, reqTs, optId } from './validate.js';
import { audit } from './audit.js';

export const ACCOUNT_STATUS = ['warming', 'active', 'sealed'];

const COLS = `id, name, category, status, purchased_at AS purchasedAt, owner_id AS ownerId, note,
  created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;

function assertOwner(db, ownerId) {
  if (ownerId == null) return;
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(ownerId);
  if (!row) throw httpError(400, 'bad_request', '负责人不存在');
}

export function getAccountOrThrow(db, id) {
  const row = db.prepare(`SELECT ${COLS} FROM accounts WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!row) throw httpError(404, 'not_found', '账号不存在');
  return row;
}

// S1：创建账号必须同事务生成一条 type='purchase'、金额=买入成本的投入记录；初始 status='warming'
export function createAccount(db, input, actorId) {
  const name = reqString(input.name, '账号名');
  const category = reqString(input.category, '赛道品类');
  const purchaseCostCents = reqPositiveCents(input.purchaseCostCents, '买入成本');
  const purchasedAt = reqTs(input.purchasedAt, '买入日期');
  const ownerId = optId(input.ownerId);
  assertOwner(db, ownerId);
  const note = optString(input.note);
  const now = Date.now();

  const id = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO accounts (name, category, status, purchased_at, owner_id, note, created_at, updated_at)
       VALUES (?, ?, 'warming', ?, ?, ?, ?, ?)`,
    ).run(name, category, purchasedAt, ownerId, note, now, now);
    const accountId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO account_investments (account_id, type, amount_cents, spent_at, note, created_at, updated_at)
       VALUES (?, 'purchase', ?, ?, '买入成本（建档自动生成）', ?, ?)`,
    ).run(accountId, purchaseCostCents, purchasedAt, now, now);
    return accountId;
  })();

  audit(db, { userId: actorId, action: 'account.create', targetType: 'account', targetId: id, detail: { name, purchaseCostCents } });
  return getAccountOrThrow(db, id);
}

export function listAccounts(db, { category, ownerId, status } = {}) {
  const conds = ['deleted_at IS NULL'];
  const params = [];
  if (category) { conds.push('category = ?'); params.push(category); }
  if (ownerId) { conds.push('owner_id = ?'); params.push(Number(ownerId)); }
  if (status) { reqEnum(status, ACCOUNT_STATUS, '状态'); conds.push('status = ?'); params.push(status); }
  return db.prepare(`SELECT ${COLS} FROM accounts WHERE ${conds.join(' AND ')} ORDER BY id`).all(...params);
}

export function accountTotals(db, accountId) {
  const inv = db.prepare(
    `SELECT
       COALESCE(SUM(amount_cents), 0) AS totalInvestedCents,
       COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount_cents END), 0) AS purchaseCents,
       COALESCE(SUM(CASE WHEN type = 'traffic' THEN amount_cents END), 0) AS trafficCents
     FROM account_investments WHERE account_id = ? AND deleted_at IS NULL`,
  ).get(accountId);
  const ord = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS totalRevenueCents, COUNT(*) AS orderCount, MAX(published_at) AS lastOrderAt
     FROM ad_orders WHERE account_id = ? AND deleted_at IS NULL`,
  ).get(accountId);
  return { ...inv, ...ord };
}

export function getAccountDetail(db, id) {
  const account = getAccountOrThrow(db, id);
  return {
    ...account,
    totals: accountTotals(db, id),
    investments: db.prepare(
      `SELECT id, account_id AS accountId, type, amount_cents AS amountCents, spent_at AS spentAt, note,
              created_at AS createdAt, updated_at AS updatedAt
       FROM account_investments WHERE account_id = ? AND deleted_at IS NULL ORDER BY spent_at DESC`,
    ).all(id),
    orders: db.prepare(
      `SELECT id, account_id AS accountId, customer_id AS customerId, brand, product, brief,
              amount_cents AS amountCents, channel, published_at AS publishedAt, created_at AS createdAt
       FROM ad_orders WHERE account_id = ? AND deleted_at IS NULL ORDER BY published_at DESC`,
    ).all(id),
  };
}

export function updateAccount(db, id, patch, actorId) {
  getAccountOrThrow(db, id);
  const sets = [];
  const params = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(reqString(patch.name, '账号名')); }
  if (patch.category !== undefined) { sets.push('category = ?'); params.push(reqString(patch.category, '赛道品类')); }
  if (patch.status !== undefined) { sets.push('status = ?'); params.push(reqEnum(patch.status, ACCOUNT_STATUS, '状态')); }
  if (patch.purchasedAt !== undefined) { sets.push('purchased_at = ?'); params.push(reqTs(patch.purchasedAt, '买入日期')); }
  if (patch.ownerId !== undefined) {
    const ownerId = optId(patch.ownerId);
    assertOwner(db, ownerId);
    sets.push('owner_id = ?'); params.push(ownerId);
  }
  if (patch.note !== undefined) { sets.push('note = ?'); params.push(optString(patch.note)); }
  if (sets.length === 0) throw httpError(400, 'bad_request', '无可更新字段');
  sets.push('updated_at = ?');
  params.push(Date.now(), id);
  db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(db, { userId: actorId, action: 'account.update', targetType: 'account', targetId: id, detail: patch });
  return getAccountOrThrow(db, id);
}

export function softDeleteAccount(db, id, actorId) {
  getAccountOrThrow(db, id);
  db.prepare('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  audit(db, { userId: actorId, action: 'account.delete', targetType: 'account', targetId: id });
}
