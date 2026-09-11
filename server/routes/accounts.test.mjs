// S1 账号建档与买入登记 + 账号 CRUD 权限
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember } from '../test/helpers.mjs';

let t, admin;
const BUY_DATE = Date.UTC(2026, 0, 10);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function postAccount(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/accounts', headers: { cookie }, payload });
}

describe('S1: 账号建档与买入登记', () => {
  it('S1: 录入新账号时同事务产生该账号记录和一条金额等于买入成本的「买入」投入记录', async () => {
    await setup();
    const res = await postAccount({ name: '美妆一号', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 150000 });
    expect(res.statusCode).toBe(200);
    const account = res.json();
    expect(account.status).toBe('warming');
    const inv = await t.app.inject({ method: 'GET', url: `/api/investments?accountId=${account.id}`, headers: { cookie: admin } });
    expect(inv.json().investments).toHaveLength(1);
    expect(inv.json().investments[0].type).toBe('purchase');
    expect(inv.json().investments[0].amountCents).toBe(150000);
  });

  it('S1: 账号新建未接任何广告单时状态为「起号中」（warming）', async () => {
    await setup();
    const res = await postAccount({ name: '穿搭小号', category: '穿搭', purchasedAt: BUY_DATE, purchaseCostCents: 80000 });
    expect(res.json().status).toBe('warming');
  });

  it('S1: 赛道品类为空提交时被拒绝并提示必填', async () => {
    await setup();
    const res = await postAccount({ name: '无赛道', category: '', purchasedAt: BUY_DATE, purchaseCostCents: 80000 });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('赛道');
  });

  it('S1: 账号出现在账号列表，买入金额计入累计投入', async () => {
    await setup();
    const res = await postAccount({ name: '美妆一号', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 150000 });
    const id = res.json().id;
    const list = await t.app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: admin } });
    expect(list.json().accounts.map((a) => a.id)).toContain(id);
    const detail = await t.app.inject({ method: 'GET', url: `/api/accounts/${id}`, headers: { cookie: admin } });
    expect(detail.json().account.totals.totalInvestedCents).toBe(150000);
  });

  it('S1: 缺买入成本 / 金额非正整数 / 缺名称 → 400', async () => {
    await setup();
    expect((await postAccount({ name: 'x', category: '美妆', purchasedAt: BUY_DATE })).statusCode).toBe(400);
    expect((await postAccount({ name: 'x', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: -5 })).statusCode).toBe(400);
    expect((await postAccount({ category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 100 })).statusCode).toBe(400);
  });

  it('S1: ownerId 指向不存在的成员 → 400', async () => {
    await setup();
    const res = await postAccount({ name: 'x', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 100, ownerId: 999 });
    expect(res.statusCode).toBe(400);
  });
});

describe('账号 CRUD 与权限', () => {
  it('member 可做账号全部 CRUD；未登录 401', async () => {
    await setup();
    const member = await createMember(t.app, admin);
    const staff = await loginAs(t.app, 'staff', 'staff-pass-123');
    const res = await postAccount({ name: '员工的号', category: '家居', purchasedAt: BUY_DATE, purchaseCostCents: 50000, ownerId: member.id }, staff);
    expect(res.statusCode).toBe(200);
    const id = res.json().id;
    const patch = await t.app.inject({ method: 'PATCH', url: `/api/accounts/${id}`, headers: { cookie: staff }, payload: { status: 'active', note: '开始接单' } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe('active');
    const del = await t.app.inject({ method: 'DELETE', url: `/api/accounts/${id}`, headers: { cookie: staff } });
    expect(del.statusCode).toBe(200);
    const anon = await t.app.inject({ method: 'GET', url: '/api/accounts' });
    expect(anon.statusCode).toBe(401);
  });

  it('软删不硬删：删除后行仍在库（deleted_at 置位），列表不再出现；删除写审计日志', async () => {
    await setup();
    const res = await postAccount({ name: '美妆一号', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 150000 });
    const id = res.json().id;
    await t.app.inject({ method: 'DELETE', url: `/api/accounts/${id}`, headers: { cookie: admin } });
    const row = t.db.prepare('SELECT deleted_at FROM accounts WHERE id = ?').get(id);
    expect(row.deleted_at).not.toBeNull();
    const list = await t.app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: admin } });
    expect(list.json().accounts).toHaveLength(0);
    const auditRow = t.db.prepare("SELECT * FROM audit_log WHERE action = 'account.delete'").get();
    expect(auditRow).toBeTruthy();
  });

  it('PATCH 状态枚举校验；不存在的账号 404', async () => {
    await setup();
    const res = await postAccount({ name: 'x', category: '美妆', purchasedAt: BUY_DATE, purchaseCostCents: 100 });
    const id = res.json().id;
    const bad = await t.app.inject({ method: 'PATCH', url: `/api/accounts/${id}`, headers: { cookie: admin }, payload: { status: 'idle' } });
    expect(bad.statusCode).toBe(400);
    const missing = await t.app.inject({ method: 'PATCH', url: '/api/accounts/999', headers: { cookie: admin }, payload: { status: 'active' } });
    expect(missing.statusCode).toBe(404);
  });
});
