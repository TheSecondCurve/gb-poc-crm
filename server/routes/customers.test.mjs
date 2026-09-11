// S5 客户管理底座 + 客户 CRUD
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs } from '../test/helpers.mjs';

let t, admin, accountId;
const D1 = Date.UTC(2026, 2, 15);
const D2 = Date.UTC(2026, 4, 20);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
  const acc = await t.app.inject({
    method: 'POST', url: '/api/accounts', headers: { cookie: admin },
    payload: { name: '美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 10), purchaseCostCents: 100000 },
  });
  accountId = acc.json().id;
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function postCustomer(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/customers', headers: { cookie }, payload });
}
function postOrder(payload) {
  return t.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie: admin }, payload });
}

describe('S5: 客户管理底座', () => {
  it('S5: 客户详情列出全部历史订单，累计金额等于订单金额之和，含最近合作日期', async () => {
    await setup();
    const cus = await postCustomer({ name: '欧莱雅', type: 'brand', wechat: 'loreal' });
    const cid = cus.json().id;
    await postOrder({ accountId, customerId: cid, brand: '兰蔻', amountCents: 120000, channel: 'private', publishedAt: D1 });
    await postOrder({ accountId, customerId: cid, brand: '雅诗兰黛', amountCents: 80000, channel: 'platform', publishedAt: D2 });
    const detail = await t.app.inject({ method: 'GET', url: `/api/customers/${cid}`, headers: { cookie: admin } });
    const customer = detail.json().customer;
    expect(customer.orders).toHaveLength(2);
    expect(customer.orders[0].brand).toBeDefined();
    expect(customer.totals.totalCents).toBe(200000);
    expect(customer.totals.lastOrderAt).toBe(D2);
  });

  it('S5: 客户列表含名称/类型/累计合作金额/最近合作日期', async () => {
    await setup();
    const cus = await postCustomer({ name: '欧莱雅', type: 'brand' });
    await postOrder({ accountId, customerId: cus.json().id, brand: '兰蔻', amountCents: 120000, channel: 'private', publishedAt: D1 });
    const list = await t.app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: admin } });
    const row = list.json().customers[0];
    expect(row.name).toBe('欧莱雅');
    expect(row.type).toBe('brand');
    expect(row.totals.totalCents).toBe(120000);
    expect(row.totals.lastOrderAt).toBe(D1);
  });

  it('类型枚举校验；缺名称/类型 → 400', async () => {
    await setup();
    expect((await postCustomer({ name: 'x', type: 'friend' })).statusCode).toBe(400);
    expect((await postCustomer({ type: 'brand' })).statusCode).toBe(400);
    expect((await postCustomer({ name: 'x' })).statusCode).toBe(400);
  });

  it('软删不硬删；未登录 401；PATCH 更新联系方式', async () => {
    await setup();
    const cus = await postCustomer({ name: '欧莱雅', type: 'brand' });
    const cid = cus.json().id;
    const patch = await t.app.inject({ method: 'PATCH', url: `/api/customers/${cid}`, headers: { cookie: admin }, payload: { wechat: 'new-wx' } });
    expect(patch.json().wechat).toBe('new-wx');
    await t.app.inject({ method: 'DELETE', url: `/api/customers/${cid}`, headers: { cookie: admin } });
    expect(t.db.prepare('SELECT deleted_at FROM customers WHERE id = ?').get(cid).deleted_at).not.toBeNull();
    const list = await t.app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: admin } });
    expect(list.json().customers).toHaveLength(0);
    expect((await t.app.inject({ method: 'GET', url: '/api/customers' })).statusCode).toBe(401);
  });
});
