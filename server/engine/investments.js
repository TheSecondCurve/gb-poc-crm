// 账号投入业务引擎：S2 投流记账（买入记录由 S1 建档自动生成）
import { httpError } from './errors.js';
import { optString, reqPositiveCents, reqEnum, reqTs, optId } from './validate.js';
import { audit } from './audit.js';

export const INVESTMENT_TYPES = ['purchase', 'traffic'];

const COLS = `id, account_id AS accountId, type, amount_cents AS amountCents, spent_at AS spentAt, note,
  created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;

export function getInvestmentOrThrow(db, id) {
  const row = db.prepare(`SELECT ${COLS} FROM account_investments WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!row) throw httpError(404, 'not_found', '投入记录不存在');
  return row;
}

function assertAccount(db, accountId) {
  const row = db.prepare('SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL').get(accountId);
  if (!row) throw httpError(400, 'bad_request', '账号不存在');
}

export function createInvestment(db, input, actorId) {
  const accountId = optId(input.accountId);
  if (accountId == null) throw httpError(400, 'bad_request', '账号必填');
  assertAccount(db, accountId);
  const type = reqEnum(input.type, INVESTMENT_TYPES, '投入类型');
  const amountCents = reqPositiveCents(input.amountCents, '金额');
  const spentAt = reqTs(input.spentAt, '日期');
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO account_investments (account_id, type, amount_cents, spent_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(accountId, type, amountCents, spentAt, optString(input.note), now, now);
  audit(db, { userId: actorId, action: 'investment.create', targetType: 'account_investment', targetId: info.lastInsertRowid, detail: { accountId, type, amountCents } });
  return getInvestmentOrThrow(db, Number(info.lastInsertRowid));
}

export function listInvestments(db, { accountId, type, from, to } = {}) {
  const conds = ['deleted_at IS NULL'];
  const params = [];
  if (accountId) { conds.push('account_id = ?'); params.push(Number(accountId)); }
  if (type) { reqEnum(type, INVESTMENT_TYPES, '投入类型'); conds.push('type = ?'); params.push(type); }
  if (from) { conds.push('spent_at >= ?'); params.push(Number(from)); }
  if (to) { conds.push('spent_at < ?'); params.push(Number(to)); }
  return db.prepare(`SELECT ${COLS} FROM account_investments WHERE ${conds.join(' AND ')} ORDER BY spent_at DESC`).all(...params);
}

export function updateInvestment(db, id, patch, actorId) {
  getInvestmentOrThrow(db, id);
  const sets = [];
  const params = [];
  if (patch.type !== undefined) { sets.push('type = ?'); params.push(reqEnum(patch.type, INVESTMENT_TYPES, '投入类型')); }
  if (patch.amountCents !== undefined) { sets.push('amount_cents = ?'); params.push(reqPositiveCents(patch.amountCents, '金额')); }
  if (patch.spentAt !== undefined) { sets.push('spent_at = ?'); params.push(reqTs(patch.spentAt, '日期')); }
  if (patch.note !== undefined) { sets.push('note = ?'); params.push(optString(patch.note)); }
  if (sets.length === 0) throw httpError(400, 'bad_request', '无可更新字段');
  sets.push('updated_at = ?');
  params.push(Date.now(), id);
  db.prepare(`UPDATE account_investments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(db, { userId: actorId, action: 'investment.update', targetType: 'account_investment', targetId: id, detail: patch });
  return getInvestmentOrThrow(db, id);
}

export function softDeleteInvestment(db, id, actorId) {
  getInvestmentOrThrow(db, id);
  db.prepare('UPDATE account_investments SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  audit(db, { userId: actorId, action: 'investment.delete', targetType: 'account_investment', targetId: id });
}
