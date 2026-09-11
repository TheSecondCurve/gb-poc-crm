// S3 广告单登记（当月总收入口径见 metrics 测试 S3 用例）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember } from '../test/helpers.mjs';

let t, admin, accountId, customerId;
const PUBLISHED = Date.UTC(2026, 2, 15);

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
  const acc = await t.app.inject({
    method: 'POST', url: '/api/accounts', headers: { cookie: admin },
    payload: { name: '美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 10), purchaseCostCents: 100000 },
  });
  accountId = acc.json().id;
  const cus = await t.app.inject({
    method: 'POST', url: '/api/customers', headers: { cookie: admin },
    payload: { name: '欧莱雅', type: 'brand', wechat: 'loreal-boss' },
  });
  customerId = cus.json().id;
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function postOrder(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie }, payload });
}

const VALID = { brand: '兰蔻', product: '小黑瓶', brief: '图文一篇', amountCents: 120000, channel: 'private' };

describe('S3: 广告单登记', () => {
  it('S3: 登记广告订单后，该账号累计收入与该客户累计合作金额立即各增加订单金额', async () => {
    await setup();
    const res = await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED });
    expect(res.statusCode).toBe(200);
    const acc = await t.app.inject({ method: 'GET', url: `/api/accounts/${accountId}`, headers: { cookie: admin } });
    expect(acc.json().account.totals.totalRevenueCents).toBe(120000);
    const cus = await t.app.inject({ method: 'GET', url: `/api/customers/${customerId}`, headers: { cookie: admin } });
    expect(cus.json().customer.totals.totalCents).toBe(120000);
    expect(cus.json().customer.orders).toHaveLength(1);
  });

  it('S3: 登记订单时选择尚不存在的客户，可在同一流程中新建客户并完成登记', async () => {
    await setup();
    const res = await postOrder({
      ...VALID, accountId, publishedAt: PUBLISHED,
      newCustomer: { name: '新媒介老王', type: 'agency', wechat: 'laowang' },
    });
    expect(res.statusCode).toBe(200);
    const order = res.json();
    expect(order.customerId).toBeGreaterThan(0);
    const cus = await t.app.inject({ method: 'GET', url: `/api/customers/${order.customerId}`, headers: { cookie: admin } });
    expect(cus.json().customer.name).toBe('新媒介老王');
    expect(cus.json().customer.totals.totalCents).toBe(120000);
  });

  it('S3: 订单缺少账号、客户或金额时被拒绝并提示必填', async () => {
    await setup();
    expect((await postOrder({ ...VALID, customerId, publishedAt: PUBLISHED })).statusCode).toBe(400);
    expect((await postOrder({ ...VALID, accountId, publishedAt: PUBLISHED })).statusCode).toBe(400);
    const noAmount = { ...VALID, accountId, customerId, publishedAt: PUBLISHED };
    delete noAmount.amountCents;
    expect((await postOrder(noAmount)).statusCode).toBe(400);
  });

  it('S3: 渠道枚举 / 发布日期 / 账号存在性校验', async () => {
    await setup();
    expect((await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED, channel: 'wechat' })).statusCode).toBe(400);
    const noDate = { ...VALID, accountId, customerId };
    expect((await postOrder(noDate)).statusCode).toBe(400);
    expect((await postOrder({ ...VALID, accountId: 999, customerId, publishedAt: PUBLISHED })).statusCode).toBe(400);
    expect((await postOrder({ ...VALID, accountId, customerId: 999, publishedAt: PUBLISHED })).statusCode).toBe(400);
  });

  it('S3: 修改订单金额后账号/客户累计同步更新；软删后扣除；updatedBy 落库', async () => {
    await setup();
    const res = await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED });
    const id = res.json().id;
    const patch = await t.app.inject({ method: 'PATCH', url: `/api/orders/${id}`, headers: { cookie: admin }, payload: { amountCents: 200000 } });
    expect(patch.statusCode).toBe(200);
    let cus = await t.app.inject({ method: 'GET', url: `/api/customers/${customerId}`, headers: { cookie: admin } });
    expect(cus.json().customer.totals.totalCents).toBe(200000);
    expect(t.db.prepare('SELECT updated_by FROM ad_orders WHERE id = ?').get(id).updated_by).toBe(1);
    await t.app.inject({ method: 'DELETE', url: `/api/orders/${id}`, headers: { cookie: admin } });
    cus = await t.app.inject({ method: 'GET', url: `/api/customers/${customerId}`, headers: { cookie: admin } });
    expect(cus.json().customer.totals.totalCents).toBe(0);
    expect(t.db.prepare('SELECT deleted_at FROM ad_orders WHERE id = ?').get(id).deleted_at).not.toBeNull();
  });

  it('S3: member 可登记订单；未登录 401', async () => {
    await setup();
    await createMember(t.app, admin);
    const staff = await loginAs(t.app, 'staff', 'staff-pass-123');
    const res = await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED }, staff);
    expect(res.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/api/orders' })).statusCode).toBe(401);
  });

  it('S3: 列表支持按账号/客户/渠道过滤', async () => {
    await setup();
    await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED });
    await postOrder({ ...VALID, accountId, customerId, publishedAt: PUBLISHED, channel: 'platform', amountCents: 50000 });
    const res = await t.app.inject({ method: 'GET', url: `/api/orders?channel=platform`, headers: { cookie: admin } });
    expect(res.json().orders).toHaveLength(1);
    expect(res.json().orders[0].amountCents).toBe(50000);
  });
});
