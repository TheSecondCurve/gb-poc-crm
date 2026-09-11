// S7 运营费用记账（CRUD 部分；净结余与账号盈亏隔离口径见 metrics 测试 S7 用例）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs } from '../test/helpers.mjs';

let t, admin;
const SPENT = Date.UTC(2026, 2, 1);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function postExpense(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/expenses', headers: { cookie }, payload });
}

describe('S7: 运营费用记账', () => {
  it('S7: 录入工资/办公/其他费用，列表可按月过滤', async () => {
    await setup();
    expect((await postExpense({ category: 'salary', amountCents: 800000, spentAt: SPENT, note: '3 月工资' })).statusCode).toBe(200);
    expect((await postExpense({ category: 'office', amountCents: 20000, spentAt: SPENT })).statusCode).toBe(200);
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/expenses?from=${Date.UTC(2026, 2, 1)}&to=${Date.UTC(2026, 3, 1)}`,
      headers: { cookie: admin },
    });
    expect(res.json().expenses).toHaveLength(2);
  });

  it('类别枚举校验；缺金额/日期 → 400', async () => {
    await setup();
    expect((await postExpense({ category: 'travel', amountCents: 100, spentAt: SPENT })).statusCode).toBe(400);
    expect((await postExpense({ category: 'salary', spentAt: SPENT })).statusCode).toBe(400);
    expect((await postExpense({ category: 'salary', amountCents: 100 })).statusCode).toBe(400);
  });

  it('软删不硬删 + 审计；未登录 401；member 可记账', async () => {
    await setup();
    const res = await postExpense({ category: 'other', amountCents: 5000, spentAt: SPENT });
    const id = res.json().id;
    await t.app.inject({ method: 'DELETE', url: `/api/expenses/${id}`, headers: { cookie: admin } });
    expect(t.db.prepare('SELECT deleted_at FROM operating_expenses WHERE id = ?').get(id).deleted_at).not.toBeNull();
    expect(t.db.prepare("SELECT * FROM audit_log WHERE action = 'expense.delete'").get()).toBeTruthy();
    expect((await t.app.inject({ method: 'GET', url: '/api/expenses' })).statusCode).toBe(401);
    const staff = await loginAs(t.app, 'staff', 'staff-pass-123').catch(() => null);
    if (!staff) {
      await t.app.inject({ method: 'POST', url: '/api/users', headers: { cookie: admin }, payload: { username: 'staff', password: 'staff-pass-123', displayName: '员工', role: 'member' } });
    }
    const staffCookie = await loginAs(t.app, 'staff', 'staff-pass-123');
    expect((await postExpense({ category: 'office', amountCents: 1000, spentAt: SPENT }, staffCookie)).statusCode).toBe(200);
  });
});
