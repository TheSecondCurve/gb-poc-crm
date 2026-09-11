// 运营费用业务引擎：S7 记账（独立账，不摊到账号）
import { httpError } from './errors.js';
import { optString, reqPositiveCents, reqEnum, reqTs } from './validate.js';
import { audit } from './audit.js';

export const EXPENSE_CATEGORIES = ['salary', 'office', 'other'];

const COLS = `id, category, amount_cents AS amountCents, spent_at AS spentAt, note,
  created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`;

export function getExpenseOrThrow(db, id) {
  const row = db.prepare(`SELECT ${COLS} FROM operating_expenses WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!row) throw httpError(404, 'not_found', '费用记录不存在');
  return row;
}

export function createExpense(db, input, actorId) {
  const category = reqEnum(input.category, EXPENSE_CATEGORIES, '类别');
  const amountCents = reqPositiveCents(input.amountCents, '金额');
  const spentAt = reqTs(input.spentAt, '日期');
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO operating_expenses (category, amount_cents, spent_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(category, amountCents, spentAt, optString(input.note), now, now);
  audit(db, { userId: actorId, action: 'expense.create', targetType: 'operating_expense', targetId: info.lastInsertRowid, detail: { category, amountCents } });
  return getExpenseOrThrow(db, Number(info.lastInsertRowid));
}

export function listExpenses(db, { category, from, to } = {}) {
  const conds = ['deleted_at IS NULL'];
  const params = [];
  if (category) { reqEnum(category, EXPENSE_CATEGORIES, '类别'); conds.push('category = ?'); params.push(category); }
  if (from) { conds.push('spent_at >= ?'); params.push(Number(from)); }
  if (to) { conds.push('spent_at < ?'); params.push(Number(to)); }
  return db.prepare(`SELECT ${COLS} FROM operating_expenses WHERE ${conds.join(' AND ')} ORDER BY spent_at DESC`).all(...params);
}

export function updateExpense(db, id, patch, actorId) {
  getExpenseOrThrow(db, id);
  const sets = [];
  const params = [];
  if (patch.category !== undefined) { sets.push('category = ?'); params.push(reqEnum(patch.category, EXPENSE_CATEGORIES, '类别')); }
  if (patch.amountCents !== undefined) { sets.push('amount_cents = ?'); params.push(reqPositiveCents(patch.amountCents, '金额')); }
  if (patch.spentAt !== undefined) { sets.push('spent_at = ?'); params.push(reqTs(patch.spentAt, '日期')); }
  if (patch.note !== undefined) { sets.push('note = ?'); params.push(optString(patch.note)); }
  if (sets.length === 0) throw httpError(400, 'bad_request', '无可更新字段');
  sets.push('updated_at = ?');
  params.push(Date.now(), id);
  db.prepare(`UPDATE operating_expenses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(db, { userId: actorId, action: 'expense.update', targetType: 'operating_expense', targetId: id, detail: patch });
  return getExpenseOrThrow(db, id);
}

export function softDeleteExpense(db, id, actorId) {
  getExpenseOrThrow(db, id);
  db.prepare('UPDATE operating_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  audit(db, { userId: actorId, action: 'expense.delete', targetType: 'operating_expense', targetId: id });
}
