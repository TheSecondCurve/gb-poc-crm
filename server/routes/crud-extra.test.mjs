// 业务 CRUD 补充分支：单条 GET / 404 / PATCH 各字段 / 列表过滤
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs } from '../test/helpers.mjs';

let t, admin, accountId, customerId;
const D1 = Date.UTC(2026, 2, 15);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
  accountId = (await t.app.inject({
    method: 'POST', url: '/api/accounts', headers: { cookie: admin },
    payload: { name: '美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 10), purchaseCostCents: 100000 },
  })).json().id;
  customerId = (await t.app.inject({
    method: 'POST', url: '/api/customers', headers: { cookie: admin },
    payload: { name: '欧莱雅', type: 'brand' },
  })).json().id;
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

describe('订单补充分支', () => {
  it('GET /api/orders/:id；404；PATCH 品牌/渠道/发布日期/换账号/换客户', async () => {
    await setup();
    const order = (await t.app.inject({
      method: 'POST', url: '/api/orders', headers: { cookie: admin },
      payload: { accountId, customerId, brand: '兰蔻', amountCents: 120000, channel: 'private', publishedAt: D1 },
    })).json();
    const get = await t.app.inject({ method: 'GET', url: `/api/orders/${order.id}`, headers: { cookie: admin } });
    expect(get.json().brand).toBe('兰蔻');
    expect((await t.app.inject({ method: 'GET', url: '/api/orders/999', headers: { cookie: admin } })).statusCode).toBe(404);
    const c2 = (await t.app.inject({ method: 'POST', url: '/api/customers', headers: { cookie: admin }, payload: { name: 'c2', type: 'agency' } })).json().id;
    const patch = await t.app.inject({
      method: 'PATCH', url: `/api/orders/${order.id}`, headers: { cookie: admin },
      payload: { brand: 'YSL', product: '口红', brief: '视频', channel: 'platform', publishedAt: Date.UTC(2026, 3, 1), customerId: c2 },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().brand).toBe('YSL');
    expect(patch.json().customerId).toBe(c2);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/orders/${order.id}`, headers: { cookie: admin }, payload: {} })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/orders/${order.id}`, headers: { cookie: admin }, payload: { customerId: 999 } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/orders/${order.id}`, headers: { cookie: admin }, payload: { accountId: 999 } })).statusCode).toBe(400);
  });

  it('列表按 accountId / customerId / 日期范围过滤', async () => {
    await setup();
    await t.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie: admin }, payload: { accountId, customerId, amountCents: 100, channel: 'private', publishedAt: D1 } });
    const byAcc = await t.app.inject({ method: 'GET', url: `/api/orders?accountId=${accountId}`, headers: { cookie: admin } });
    expect(byAcc.json().orders).toHaveLength(1);
    const byCus = await t.app.inject({ method: 'GET', url: `/api/orders?customerId=999`, headers: { cookie: admin } });
    expect(byCus.json().orders).toHaveLength(0);
    const byDate = await t.app.inject({ method: 'GET', url: `/api/orders?from=${Date.UTC(2026, 3, 1)}`, headers: { cookie: admin } });
    expect(byDate.json().orders).toHaveLength(0);
  });
});

describe('投流补充分支', () => {
  it('GET /api/investments/:id；404；PATCH 类型/日期/备注；类型过滤', async () => {
    await setup();
    const inv = (await t.app.inject({
      method: 'POST', url: '/api/investments', headers: { cookie: admin },
      payload: { accountId, type: 'traffic', amountCents: 30000, spentAt: D1 },
    })).json();
    expect((await t.app.inject({ method: 'GET', url: `/api/investments/${inv.id}`, headers: { cookie: admin } })).json().amountCents).toBe(30000);
    expect((await t.app.inject({ method: 'GET', url: '/api/investments/999', headers: { cookie: admin } })).statusCode).toBe(404);
    const patch = await t.app.inject({
      method: 'PATCH', url: `/api/investments/${inv.id}`, headers: { cookie: admin },
      payload: { type: 'purchase', spentAt: Date.UTC(2026, 3, 1), note: '补录' },
    });
    expect(patch.json().type).toBe('purchase');
    expect((await t.app.inject({ method: 'PATCH', url: `/api/investments/${inv.id}`, headers: { cookie: admin }, payload: {} })).statusCode).toBe(400);
    const list = await t.app.inject({ method: 'GET', url: '/api/investments?type=purchase', headers: { cookie: admin } });
    expect(list.json().investments.length).toBeGreaterThanOrEqual(2); // 建档买入 + 改类型的这条
  });
});

describe('费用补充分支', () => {
  it('GET /api/expenses/:id；404；PATCH 类别/金额/日期/备注；类别过滤', async () => {
    await setup();
    const exp = (await t.app.inject({
      method: 'POST', url: '/api/expenses', headers: { cookie: admin },
      payload: { category: 'other', amountCents: 5000, spentAt: D1 },
    })).json();
    expect((await t.app.inject({ method: 'GET', url: `/api/expenses/${exp.id}`, headers: { cookie: admin } })).json().category).toBe('other');
    expect((await t.app.inject({ method: 'GET', url: '/api/expenses/999', headers: { cookie: admin } })).statusCode).toBe(404);
    const patch = await t.app.inject({
      method: 'PATCH', url: `/api/expenses/${exp.id}`, headers: { cookie: admin },
      payload: { category: 'office', amountCents: 6000, spentAt: Date.UTC(2026, 3, 2), note: '房租' },
    });
    expect(patch.json().category).toBe('office');
    expect(patch.json().amountCents).toBe(6000);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/expenses/${exp.id}`, headers: { cookie: admin }, payload: {} })).statusCode).toBe(400);
    const list = await t.app.inject({ method: 'GET', url: '/api/expenses?category=office', headers: { cookie: admin } });
    expect(list.json().expenses).toHaveLength(1);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/expenses/999', headers: { cookie: admin } })).statusCode).toBe(404);
  });
});

describe('客户补充分支', () => {
  it('GET /api/customers/:id 404；PATCH 名称/类型/备注；类型过滤；删除不存在 404', async () => {
    await setup();
    expect((await t.app.inject({ method: 'GET', url: '/api/customers/999', headers: { cookie: admin } })).statusCode).toBe(404);
    const patch = await t.app.inject({
      method: 'PATCH', url: `/api/customers/${customerId}`, headers: { cookie: admin },
      payload: { name: '欧莱雅集团', type: 'agency', note: '大客户' },
    });
    expect(patch.json().name).toBe('欧莱雅集团');
    expect((await t.app.inject({ method: 'PATCH', url: `/api/customers/${customerId}`, headers: { cookie: admin }, payload: {} })).statusCode).toBe(400);
    const list = await t.app.inject({ method: 'GET', url: '/api/customers?type=agency', headers: { cookie: admin } });
    expect(list.json().customers).toHaveLength(1);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/customers/999', headers: { cookie: admin } })).statusCode).toBe(404);
  });
});

describe('账号补充分支', () => {
  it('PATCH 名称/买入日期/清空负责人；列表按赛道/负责人/状态过滤；删除不存在 404', async () => {
    await setup();
    const patch = await t.app.inject({
      method: 'PATCH', url: `/api/accounts/${accountId}`, headers: { cookie: admin },
      payload: { name: '美妆大号', purchasedAt: Date.UTC(2026, 0, 20), ownerId: 1 },
    });
    expect(patch.json().name).toBe('美妆大号');
    expect(patch.json().ownerId).toBe(1);
    const cleared = await t.app.inject({ method: 'PATCH', url: `/api/accounts/${accountId}`, headers: { cookie: admin }, payload: { ownerId: null } });
    expect(cleared.json().ownerId).toBeNull();
    expect((await t.app.inject({ method: 'PATCH', url: `/api/accounts/${accountId}`, headers: { cookie: admin }, payload: { ownerId: 999 } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: `/api/accounts/${accountId}`, headers: { cookie: admin }, payload: {} })).statusCode).toBe(400);
    const byCat = await t.app.inject({ method: 'GET', url: '/api/accounts?category=穿搭', headers: { cookie: admin } });
    expect(byCat.json().accounts).toHaveLength(0);
    const byStatus = await t.app.inject({ method: 'GET', url: '/api/accounts?status=warming', headers: { cookie: admin } });
    expect(byStatus.json().accounts).toHaveLength(1);
    expect((await t.app.inject({ method: 'GET', url: '/api/accounts?status=nope', headers: { cookie: admin } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/accounts/999', headers: { cookie: admin } })).statusCode).toBe(404);
  });
});
