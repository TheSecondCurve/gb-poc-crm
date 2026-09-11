// PAT 令牌：签发/校验/过期/吊销/禁用用户联动；cookie 访问 /api/v1/agent/* 一律 403
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember, issuePat, ADMIN_PASSWORD } from '../test/helpers.mjs';

let t;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

describe('PAT 签发与自助管理', () => {
  it('用户名+密码签发 PAT：返回完整令牌一次、前缀、90 天过期；库内只存 hash', async () => {
    t = await createTestApp();
    const issued = await issuePat(t.app, { scope: 'read' });
    expect(issued.token).toMatch(/^xhp_/);
    expect(issued.prefix).toBe(issued.token.slice(4, 12));
    const ninetyDays = 90 * 24 * 3600 * 1000;
    expect(Math.abs(issued.expiresAt - (Date.now() + ninetyDays))).toBeLessThan(60 * 1000);
    const row = t.db.prepare('SELECT * FROM pat_tokens WHERE id = ?').get(issued.id);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toBe(issued.token);
    expect(row.scope).toBe('read');
  });

  it('错误密码签发 → 401；scope 非法 → 400', async () => {
    t = await createTestApp();
    const bad = await t.app.inject({ method: 'POST', url: '/api/v1/auth/tokens', payload: { username: 'admin', password: 'nope-nope-nope', scope: 'read' } });
    expect(bad.statusCode).toBe(401);
    const badScope = await t.app.inject({ method: 'POST', url: '/api/v1/auth/tokens', payload: { username: 'admin', password: ADMIN_PASSWORD, scope: 'admin' } });
    expect(badScope.statusCode).toBe(400);
  });

  it('GET /api/v1/auth/tokens 列出自己的令牌（不含 hash）；未登录 401', async () => {
    t = await createTestApp();
    await issuePat(t.app, { scope: 'read' });
    const cookie = await loginAs(t.app);
    const list = await t.app.inject({ method: 'GET', url: '/api/v1/auth/tokens', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().tokens).toHaveLength(1);
    expect(list.json().tokens[0].tokenHash).toBeUndefined();
    const anon = await t.app.inject({ method: 'GET', url: '/api/v1/auth/tokens' });
    expect(anon.statusCode).toBe(401);
  });

  it('用户可吊销自己的令牌；吊销后立即 401；吊销不删行', async () => {
    t = await createTestApp();
    const issued = await issuePat(t.app);
    const cookie = await loginAs(t.app);
    const del = await t.app.inject({ method: 'DELETE', url: `/api/v1/auth/tokens/${issued.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(200);
    const use = await t.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sql',
      headers: { authorization: `Bearer ${issued.token}` },
      payload: { sql: 'SELECT 1' },
    });
    expect(use.statusCode).toBe(401);
    const row = t.db.prepare('SELECT * FROM pat_tokens WHERE id = ?').get(issued.id);
    expect(row.revoked_at).not.toBeNull();
    expect(row.revoked_by).not.toBeNull();
  });

  it('member 不能吊销他人令牌（403），admin 可吊销任意令牌', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    await createMember(t.app, admin);
    const adminPat = await issuePat(t.app, { scope: 'read' });
    const memberCookie = await loginAs(t.app, 'staff', 'staff-pass-123');
    const forbid = await t.app.inject({ method: 'DELETE', url: `/api/v1/auth/tokens/${adminPat.id}`, headers: { cookie: memberCookie } });
    expect(forbid.statusCode).toBe(403);
    const ok = await t.app.inject({ method: 'DELETE', url: `/api/v1/auth/tokens/${adminPat.id}`, headers: { cookie: admin } });
    expect(ok.statusCode).toBe(200);
  });

  it('过期令牌 → 401', async () => {
    t = await createTestApp();
    const issued = await issuePat(t.app);
    t.db.prepare('UPDATE pat_tokens SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, issued.id);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sql',
      headers: { authorization: `Bearer ${issued.token}` },
      payload: { sql: 'SELECT 1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('禁用用户联动撤销其全部令牌', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    const member = await createMember(t.app, admin);
    const pat = await issuePat(t.app, { username: 'staff', password: 'staff-pass-123' });
    await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { disable: true } });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sql',
      headers: { authorization: `Bearer ${pat.token}` },
      payload: { sql: 'SELECT 1' },
    });
    expect(res.statusCode).toBe(401);
    const row = t.db.prepare('SELECT * FROM pat_tokens WHERE id = ?').get(pat.id);
    expect(row.revoked_at).not.toBeNull();
  });

  it('签发/吊销均写审计日志（永久保留）', async () => {
    t = await createTestApp();
    const issued = await issuePat(t.app, { scope: 'read' });
    const cookie = await loginAs(t.app);
    await t.app.inject({ method: 'DELETE', url: `/api/v1/auth/tokens/${issued.id}`, headers: { cookie } });
    const rows = t.db.prepare("SELECT action FROM audit_log WHERE action LIKE 'token.%' ORDER BY id").all().map((r) => r.action);
    expect(rows).toEqual(['token.issue', 'token.revoke']);
  });
});

describe('Agent 端点鉴权边界', () => {
  it('cookie（即使 admin）访问 /api/v1/agent/sql 一律 403', async () => {
    t = await createTestApp();
    const cookie = await loginAs(t.app);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sql',
      headers: { cookie },
      payload: { sql: 'SELECT 1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('无凭证访问 /api/v1/agent/* → 401；伪造 Bearer → 401', async () => {
    t = await createTestApp();
    const anon = await t.app.inject({ method: 'POST', url: '/api/v1/agent/sql', payload: { sql: 'SELECT 1' } });
    expect(anon.statusCode).toBe(401);
    const fake = await t.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sql',
      headers: { authorization: 'Bearer xhp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      payload: { sql: 'SELECT 1' },
    });
    expect(fake.statusCode).toBe(401);
  });
});
