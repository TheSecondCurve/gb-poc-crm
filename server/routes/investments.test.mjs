// S2 投流记账（CRUD 与累计投入部分；月度总额口径见 metrics 测试 S2 用例）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs } from '../test/helpers.mjs';

let t, admin, accountId;
const SPENT = Date.UTC(2026, 1, 5);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
  const res = await t.app.inject({
    method: 'POST', url: '/api/accounts', headers: { cookie: admin },
    payload: { name: '美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 10), purchaseCostCents: 100000 },
  });
  accountId = res.json().id;
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function postInvestment(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/investments', headers: { cookie }, payload });
}

describe('S2: 投流记账', () => {
  it('S2: 登记一笔投流记录时，该账号累计投入应立即包含该笔金额', async () => {
    await setup();
    const res = await postInvestment({ accountId, type: 'traffic', amountCents: 30000, spentAt: SPENT, note: '点赞 100' });
    expect(res.statusCode).toBe(200);
    const detail = await t.app.inject({ method: 'GET', url: `/api/accounts/${accountId}`, headers: { cookie: admin } });
    expect(detail.json().account.totals.totalInvestedCents).toBe(100000 + 30000);
    expect(detail.json().account.totals.trafficCents).toBe(30000);
  });

  it('S2: 缺账号 / 缺金额 / 缺日期 / 类型非法 → 400；账号不存在 → 400', async () => {
    await setup();
    expect((await postInvestment({ type: 'traffic', amountCents: 100, spentAt: SPENT })).statusCode).toBe(400);
    expect((await postInvestment({ accountId, type: 'traffic', spentAt: SPENT })).statusCode).toBe(400);
    expect((await postInvestment({ accountId, type: 'traffic', amountCents: 100 })).statusCode).toBe(400);
    expect((await postInvestment({ accountId, type: 'gift', amountCents: 100, spentAt: SPENT })).statusCode).toBe(400);
    expect((await postInvestment({ accountId: 999, type: 'traffic', amountCents: 100, spentAt: SPENT })).statusCode).toBe(400);
  });

  it('S2: 软删投流记录后累计投入相应减少，行仍在库', async () => {
    await setup();
    const res = await postInvestment({ accountId, type: 'traffic', amountCents: 30000, spentAt: SPENT });
    const id = res.json().id;
    await t.app.inject({ method: 'DELETE', url: `/api/investments/${id}`, headers: { cookie: admin } });
    const detail = await t.app.inject({ method: 'GET', url: `/api/accounts/${accountId}`, headers: { cookie: admin } });
    expect(detail.json().account.totals.totalInvestedCents).toBe(100000);
    expect(t.db.prepare('SELECT deleted_at FROM account_investments WHERE id = ?').get(id).deleted_at).not.toBeNull();
  });

  it('S2: 可按账号与日期范围过滤列表', async () => {
    await setup();
    await postInvestment({ accountId, type: 'traffic', amountCents: 10000, spentAt: Date.UTC(2026, 1, 5) });
    await postInvestment({ accountId, type: 'traffic', amountCents: 20000, spentAt: Date.UTC(2026, 2, 5) });
    const feb = await t.app.inject({
      method: 'GET',
      url: `/api/investments?accountId=${accountId}&from=${Date.UTC(2026, 1, 1)}&to=${Date.UTC(2026, 2, 1)}`,
      headers: { cookie: admin },
    });
    expect(feb.json().investments).toHaveLength(1);
    expect(feb.json().investments[0].amountCents).toBe(10000);
  });

  it('未登录 401；PATCH 修改金额后累计更新', async () => {
    await setup();
    expect((await t.app.inject({ method: 'GET', url: '/api/investments' })).statusCode).toBe(401);
    const res = await postInvestment({ accountId, type: 'traffic', amountCents: 30000, spentAt: SPENT });
    const id = res.json().id;
    const patch = await t.app.inject({ method: 'PATCH', url: `/api/investments/${id}`, headers: { cookie: admin }, payload: { amountCents: 45000 } });
    expect(patch.statusCode).toBe(200);
    const detail = await t.app.inject({ method: 'GET', url: `/api/accounts/${accountId}`, headers: { cookie: admin } });
    expect(detail.json().account.totals.trafficCents).toBe(45000);
  });
});
