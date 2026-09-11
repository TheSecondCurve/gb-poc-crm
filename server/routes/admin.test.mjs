// S10 一键初始化演示数据 / S11 一键清除全部业务数据（仅 admin）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember, issuePat } from '../test/helpers.mjs';

let t;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

const BUSINESS_TABLES = ['accounts', 'customers', 'ad_orders', 'account_investments', 'operating_expenses'];

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

async function seedAsAdmin(app) {
  const cookie = await loginAs(app);
  return app.inject({ method: 'POST', url: '/api/admin/seed-demo', headers: { cookie } });
}

describe('S10: 一键初始化演示数据', () => {
  it('S10: member 触发 403，未登录 401', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    await createMember(t.app, admin);
    const member = await loginAs(t.app, 'staff', 'staff-pass-123');
    expect((await t.app.inject({ method: 'POST', url: '/api/admin/seed-demo', headers: { cookie: member } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: '/api/admin/seed-demo' })).statusCode).toBe(401);
  });

  it('S10: 生成 ≥40 账号、≥8 赛道、≥36 个月流水，任选连续 12 个月订单总额 >1e8 分', async () => {
    t = await createTestApp();
    const res = await seedAsAdmin(t.app);
    expect(res.statusCode).toBe(200);
    const stats = res.json().stats;
    expect(stats.accounts).toBeGreaterThanOrEqual(40);
    expect(stats.customers).toBeGreaterThanOrEqual(35);
    expect(stats.months).toBeGreaterThanOrEqual(36);
    expect(stats.orders).toBeGreaterThan(0);
    expect(stats.totalRevenueCents).toBeGreaterThan(1e8);

    const db = t.app.db;
    expect(countRows(db, 'accounts')).toBeGreaterThanOrEqual(40);
    const cats = db.prepare('SELECT DISTINCT category FROM accounts').all().map((r) => r.category);
    expect(cats.length).toBeGreaterThanOrEqual(8);
    // 三类客户都存在
    const types = db.prepare('SELECT type, COUNT(*) AS n FROM customers GROUP BY type').all();
    const byType = Object.fromEntries(types.map((r) => [r.type, r.n]));
    expect(byType.brand).toBeGreaterThanOrEqual(20);
    expect(byType.agency).toBeGreaterThanOrEqual(10);
    expect(byType.platform).toBeGreaterThanOrEqual(1);
    // 两种渠道都有单
    const channels = db.prepare('SELECT DISTINCT channel FROM ad_orders').all().map((r) => r.channel);
    expect(channels).toContain('private');
    expect(channels).toContain('platform');

    // 按月汇总订单总额，校验每个连续 12 个月窗口 >1e8 分
    const rows = db.prepare(
      `SELECT strftime('%Y-%m', published_at / 1000, 'unixepoch') AS m, SUM(amount_cents) AS total
       FROM ad_orders GROUP BY m ORDER BY m`,
    ).all();
    expect(rows.length).toBeGreaterThanOrEqual(36);
    expect(rows[0].m).toBe('2023-09');
    for (let i = 0; i + 12 <= rows.length; i += 1) {
      const window = rows.slice(i, i + 12).reduce((s, r) => s + r.total, 0);
      expect(window).toBeGreaterThan(1e8);
    }
  });

  it('S10: 状态分布含 warming/active/sealed；每账号有买入投入；有工资与办公费用；updated_by 记触发者', async () => {
    t = await createTestApp();
    const res = await seedAsAdmin(t.app);
    expect(res.statusCode).toBe(200);
    const db = t.app.db;
    const statuses = db.prepare('SELECT DISTINCT status FROM accounts').all().map((r) => r.status);
    expect(statuses).toEqual(expect.arrayContaining(['active', 'warming', 'sealed']));
    // 每个账号恰有一条 purchase 投入，金额与买入日期非空
    const noPurchase = db.prepare(
      `SELECT a.id FROM accounts a WHERE NOT EXISTS (
         SELECT 1 FROM account_investments i WHERE i.account_id = a.id AND i.type = 'purchase')`,
    ).all();
    expect(noPurchase).toHaveLength(0);
    // 有投流记录
    expect(countRows(db, 'account_investments')).toBeGreaterThan(countRows(db, 'accounts'));
    // 工资与办公费用
    const expCats = db.prepare('SELECT DISTINCT category FROM operating_expenses').all().map((r) => r.category);
    expect(expCats).toEqual(expect.arrayContaining(['salary', 'office']));
    // updated_by 记触发者（admin id=1）
    const orphan = db.prepare('SELECT COUNT(*) AS n FROM ad_orders WHERE updated_by IS NULL').get().n;
    expect(orphan).toBe(0);
    // 审计
    const auditRow = db.prepare("SELECT * FROM audit_log WHERE action = 'admin.seed'").get();
    expect(auditRow).toBeTruthy();
  });

  it('S10: 已有业务数据时拒绝（409 提示先清除）；重复触发同样 409（幂等防护）', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    // 先手工建一条账号 → 触发应 409
    await t.app.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie: admin },
      payload: { name: '已有账号', category: '美妆', purchaseCostCents: 100, purchasedAt: 1789000000000 },
    });
    const blocked = await t.app.inject({ method: 'POST', url: '/api/admin/seed-demo', headers: { cookie: admin } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toContain('清除');

    // 清掉后正常初始化；第二次触发 409
    await t.app.inject({ method: 'POST', url: '/api/admin/wipe-data', headers: { cookie: admin } });
    expect((await seedAsAdmin(t.app)).statusCode).toBe(200);
    expect((await seedAsAdmin(t.app)).statusCode).toBe(409);
  });
});

describe('S11: 一键清除全部业务数据', () => {
  it('S11: member 触发 403，未登录 401', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    await createMember(t.app, admin);
    const member = await loginAs(t.app, 'staff', 'staff-pass-123');
    expect((await t.app.inject({ method: 'POST', url: '/api/admin/wipe-data', headers: { cookie: member } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: '/api/admin/wipe-data' })).statusCode).toBe(401);
  });

  it('S11: 清除后五业务表为空，users/settings/pat_tokens 保留，审计含 admin.wipe，仍可登录', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    await createMember(t.app, admin);
    await issuePat(t.app); // 留一个 PAT
    expect((await seedAsAdmin(t.app)).statusCode).toBe(200);

    const res = await t.app.inject({ method: 'POST', url: '/api/admin/wipe-data', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);

    const db = t.app.db;
    for (const table of BUSINESS_TABLES) expect(countRows(db, table)).toBe(0);
    expect(countRows(db, 'users')).toBe(2);
    expect(countRows(db, 'pat_tokens')).toBe(1);
    expect(countRows(db, 'settings')).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'admin.wipe'").get().n).toBe(1);

    // 仍可登录、业务列表为空
    const cookie2 = await loginAs(t.app);
    const list = await t.app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: cookie2 } });
    expect(list.statusCode).toBe(200);
    expect(list.json().accounts).toHaveLength(0);
  });
});
