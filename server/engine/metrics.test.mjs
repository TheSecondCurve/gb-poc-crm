// 指标定义层测试：S2/S3 月度口径、S4 看板、S6 客户榜与复购、S7 净结余、S8 封号、S9 估值
// 同时验证 dashboard（/api/metrics/query）与 Agent（/api/v1/agent/metrics/query）同源同口径
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, issuePat } from '../test/helpers.mjs';

const NOW = Date.UTC(2026, 3, 10); // 2026-04-10

let t, admin, pat;
let A1, A2, A3, C1, C2;

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
  pat = await issuePat(t.app, { scope: 'read' });

  const post = (url, payload) => t.app.inject({ method: 'POST', url, headers: { cookie: admin }, payload });

  A1 = (await post('/api/accounts', { name: '美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 5), purchaseCostCents: 100000 })).json().id;
  A2 = (await post('/api/accounts', { name: '穿搭小号', category: '穿搭', purchasedAt: Date.UTC(2025, 9, 1), purchaseCostCents: 50000 })).json().id;
  A3 = (await post('/api/accounts', { name: '封号', category: '美妆', purchasedAt: Date.UTC(2025, 8, 1), purchaseCostCents: 70000 })).json().id;

  await post('/api/investments', { accountId: A1, type: 'traffic', amountCents: 30000, spentAt: Date.UTC(2026, 2, 3) });
  await post('/api/investments', { accountId: A2, type: 'traffic', amountCents: 10000, spentAt: Date.UTC(2026, 2, 10) });

  C1 = (await post('/api/customers', { name: '欧莱雅', type: 'brand' })).json().id;
  C2 = (await post('/api/customers', { name: '老王媒介', type: 'agency' })).json().id;

  await post('/api/orders', { accountId: A1, customerId: C1, brand: '兰蔻', amountCents: 120000, channel: 'private', publishedAt: Date.UTC(2026, 2, 15) });
  await post('/api/orders', { accountId: A1, customerId: C2, brand: '完美日记', amountCents: 80000, channel: 'platform', publishedAt: Date.UTC(2026, 0, 20) });
  await post('/api/orders', { accountId: A2, customerId: C1, brand: 'UR', amountCents: 60000, channel: 'private', publishedAt: Date.UTC(2025, 11, 10) });

  await post('/api/expenses', { category: 'salary', amountCents: 500000, spentAt: Date.UTC(2026, 2, 1) });
}
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

function pageQuery(payload, cookie = admin) {
  return t.app.inject({ method: 'POST', url: '/api/metrics/query', headers: { cookie }, payload });
}
function agentQuery(payload) {
  return t.app.inject({
    method: 'POST', url: '/api/v1/agent/metrics/query',
    headers: { authorization: `Bearer ${pat.token}` }, payload,
  });
}

describe('S2/S3/S7: 月度总览口径', () => {
  it('S2: 某月投流总额等于该月全部投流记录金额之和', async () => {
    await setup();
    const res = await pageQuery({ metric: 'monthly_overview', params: { month: '2026-03' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.trafficCents).toBe(40000);
  });

  it('S3: 当月总收入按发布日期归集，登记后立即计入', async () => {
    await setup();
    const res = await pageQuery({ metric: 'monthly_overview', params: { month: '2026-03' } });
    expect(res.json().result.revenueCents).toBe(120000);
  });

  it('S7: 净结余 = 当月收入 − 当月投流 − 当月运营费用；录入费用立即减少净结余', async () => {
    await setup();
    let res = await pageQuery({ metric: 'monthly_overview', params: { month: '2026-03' } });
    expect(res.json().result.expenseCents).toBe(500000);
    expect(res.json().result.netCents).toBe(120000 - 40000 - 500000);
    await t.app.inject({
      method: 'POST', url: '/api/expenses', headers: { cookie: admin },
      payload: { category: 'office', amountCents: 10000, spentAt: Date.UTC(2026, 2, 20) },
    });
    res = await pageQuery({ metric: 'monthly_overview', params: { month: '2026-03' } });
    expect(res.json().result.netCents).toBe(120000 - 40000 - 510000);
  });
});

describe('S4/S8: 账号盈亏排行', () => {
  it('S4: 每个账号显示累计投入/累计收入/净盈亏，净盈亏 = 累计收入 −（买入 + 累计投流）', async () => {
    await setup();
    const res = await pageQuery({ metric: 'account_pnl', params: {} });
    const rows = res.json().result.rows;
    const a1 = rows.find((r) => r.id === A1);
    expect(a1.purchaseCents).toBe(100000);
    expect(a1.trafficCents).toBe(30000);
    expect(a1.revenueCents).toBe(200000);
    expect(a1.netCents).toBe(200000 - 100000 - 30000);
    // 按净盈亏降序
    const nets = rows.map((r) => r.netCents);
    expect(nets).toEqual([...nets].sort((a, b) => b - a));
  });

  it('S7: 运营费用不计入任何账号的投入（盈亏榜不受影响）', async () => {
    await setup();
    const res = await pageQuery({ metric: 'account_pnl', params: {} });
    const a1 = res.json().result.rows.find((r) => r.id === A1);
    expect(a1.totalInvestedCents).toBe(130000);
  });

  it('S4: 按赛道筛选时只统计该赛道账号的数据', async () => {
    await setup();
    const res = await pageQuery({ metric: 'account_pnl', params: { category: '穿搭' } });
    const rows = res.json().result.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('穿搭');
  });

  it('S8: 账号标记已封死后累计投入与收入保留可见，净盈亏照常计算（亏损）', async () => {
    await setup();
    await t.app.inject({ method: 'PATCH', url: `/api/accounts/${A3}`, headers: { cookie: admin }, payload: { status: 'sealed' } });
    const res = await pageQuery({ metric: 'account_pnl', params: {} });
    const a3 = res.json().result.rows.find((r) => r.id === A3);
    expect(a3.status).toBe('sealed');
    expect(a3.purchaseCents).toBe(70000);
    expect(a3.netCents).toBe(-70000);
  });

  it('S4: dashboard 数字与 /api/v1/agent/metrics/query 完全一致（同一份指标定义层代码）', async () => {
    await setup();
    for (const metric of ['monthly_overview', 'account_pnl', 'idle_accounts', 'customer_contribution', 'category_revenue']) {
      const params = { month: '2026-03', now: NOW };
      const page = await pageQuery({ metric, params });
      const agent = await agentQuery({ metric, params });
      expect(agent.statusCode).toBe(200);
      expect(agent.json().result).toEqual(page.json().result);
    }
  });
});

describe('S4/S8: 闲置账号预警', () => {
  it('S4: 超过阈值（默认 30 天）没有新广告订单的账号出现在预警清单；阈值可调', async () => {
    await setup();
    let res = await pageQuery({ metric: 'idle_accounts', params: { now: NOW } });
    const ids = res.json().result.rows.map((r) => r.id);
    expect(ids).toContain(A2); // 最近一单 2025-12-10
    expect(ids).toContain(A3); // A3 尚无单且未封 → 闲置
    expect(ids).not.toContain(A1); // 2026-03-20 距今 21 天
    // 阈值调低到 10 天 → A1 也闲置
    const narrow = await pageQuery({ metric: 'idle_accounts', params: { now: NOW, thresholdDays: 10 } });
    expect(narrow.json().result.rows.map((r) => r.id)).toContain(A1);
  });

  it('S8: 已封死账号不出现在闲置预警清单中', async () => {
    await setup();
    await t.app.inject({ method: 'PATCH', url: `/api/accounts/${A3}`, headers: { cookie: admin }, payload: { status: 'sealed' } });
    const res = await pageQuery({ metric: 'idle_accounts', params: { now: NOW } });
    expect(res.json().result.rows.map((r) => r.id)).not.toContain(A3);
  });

  it('S4: 闲置阈值存 settings，修改后默认口径随之变化', async () => {
    await setup();
    const set = await t.app.inject({
      method: 'PATCH', url: '/api/settings', headers: { cookie: admin },
      payload: { key: 'idle_threshold_days', value: '10' },
    });
    expect(set.statusCode).toBe(200);
    const res = await pageQuery({ metric: 'idle_accounts', params: { now: NOW } });
    expect(res.json().result.rows.map((r) => r.id)).toContain(A1);
  });
});

describe('S6: 客户贡献排行与复购提醒', () => {
  it('S6: 客户按累计合作金额降序排列，可按客户类型筛选', async () => {
    await setup();
    const res = await pageQuery({ metric: 'customer_contribution', params: {} });
    const rows = res.json().result.rows;
    expect(rows[0].id).toBe(C1);
    expect(rows[0].totalCents).toBe(180000);
    expect(rows[1].id).toBe(C2);
    const agency = await pageQuery({ metric: 'customer_contribution', params: { type: 'agency' } });
    expect(agency.json().result.rows.map((r) => r.id)).toEqual([C2]);
  });

  it('S6: 距上次合作超过阈值的客户出现在复购提醒清单（阈值存 settings 可调）', async () => {
    await setup();
    const res = await pageQuery({ metric: 'repurchase_reminders', params: { now: NOW } });
    const rows = res.json().result.rows;
    expect(rows.map((r) => r.id)).toEqual([C2]); // 2026-01-20 距今 80 天
    expect(rows[0].daysSinceLastOrder).toBe(80);
    // 阈值调到 100 天 → 无人超限
    const wide = await pageQuery({ metric: 'repurchase_reminders', params: { now: NOW, thresholdDays: 100 } });
    expect(wide.json().result.rows).toHaveLength(0);
  });
});

describe('S4: 赛道收入对比', () => {
  it('S4: 按账号赛道汇总订单金额并按月分组', async () => {
    await setup();
    const res = await pageQuery({ metric: 'category_revenue', params: {} });
    const rows = res.json().result.rows;
    const find = (c, m) => rows.find((r) => r.category === c && r.month === m)?.revenueCents;
    expect(find('美妆', '2026-01')).toBe(80000);
    expect(find('美妆', '2026-03')).toBe(120000);
    expect(find('穿搭', '2025-12')).toBe(60000);
  });
});

describe('S9: 账号估值参考', () => {
  it('S9: 有历史收入的账号显示估值参考数值及计算依据（近 N 月平均月收入 × 倍数）', async () => {
    await setup();
    const res = await pageQuery({ metric: 'account_valuation', params: { accountId: A1, months: 6, multiplier: 6, now: NOW } });
    expect(res.statusCode).toBe(200);
    const row = res.json().result.rows[0];
    // 窗口 2025-11-01 ~ 2026-05-01（UTC），A1 收入 200000
    expect(row.basis.totalRevenueCents).toBe(200000);
    expect(row.basis.months).toBe(6);
    expect(row.basis.multiplier).toBe(6);
    expect(row.basis.monthlyAvgCents).toBe(Math.round(200000 / 6));
    expect(row.valuationCents).toBe(Math.round(200000 / 6) * 6);
    expect(row.basis.windowStart).toBe(Date.UTC(2025, 10, 1));
    expect(row.basis.windowEnd).toBe(Date.UTC(2026, 4, 1));
  });

  it('S9: 参数非法（月数/倍数非正整数、指标不存在、月份格式错误）→ 400', async () => {
    await setup();
    expect((await pageQuery({ metric: 'account_valuation', params: { months: 0 } })).statusCode).toBe(400);
    expect((await pageQuery({ metric: 'nope', params: {} })).statusCode).toBe(400);
    expect((await pageQuery({ metric: 'monthly_overview', params: { month: '2026-13' } })).statusCode).toBe(400);
  });
});

describe('指标目录与鉴权', () => {
  it('GET /api/metrics 与 /api/v1/agent/metrics 返回同一份指标定义卡目录', async () => {
    await setup();
    const page = await t.app.inject({ method: 'GET', url: '/api/metrics', headers: { cookie: admin } });
    const agent = await t.app.inject({ method: 'GET', url: '/api/v1/agent/metrics', headers: { authorization: `Bearer ${pat.token}` } });
    expect(page.statusCode).toBe(200);
    expect(agent.json()).toEqual(page.json());
    const names = page.json().metrics.map((m) => m.name);
    for (const n of ['monthly_overview', 'account_pnl', 'idle_accounts', 'customer_contribution', 'category_revenue', 'repurchase_reminders', 'account_valuation']) {
      expect(names).toContain(n);
    }
    const card = page.json().metrics.find((m) => m.name === 'monthly_overview');
    expect(card.nameZh).toBeTruthy();
    expect(card.definition).toBeTruthy();
    expect(card.dimensions.length).toBeGreaterThan(0);
    expect(card.timeField).toBeTruthy();
  });

  it('未登录 401；read scope PAT 可查指标；cookie 访问 agent 端点 403', async () => {
    await setup();
    expect((await t.app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(401);
    expect((await agentQuery({ metric: 'account_pnl', params: {} })).statusCode).toBe(200);
    const cookieAgent = await t.app.inject({
      method: 'POST', url: '/api/v1/agent/metrics/query', headers: { cookie: admin }, payload: { metric: 'account_pnl', params: {} },
    });
    expect(cookieAgent.statusCode).toBe(403);
  });
});
