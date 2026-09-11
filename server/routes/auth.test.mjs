// 认证边界：bootstrap、登录/登出、cookie 会话、弱密码、登录失败锁定、禁用用户
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../app.js';
import { createTestApp, loginAs, createMember, ADMIN_PASSWORD } from '../test/helpers.mjs';

let t;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

describe('认证 bootstrap', () => {
  it('零 admin 且缺 ADMIN_PASSWORD 时拒绝启动', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xhs-boot-'));
    await expect(buildServer({ dbPath: join(dir, 't.db'), env: {}, logger: false })).rejects.toThrow(/ADMIN_PASSWORD/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('用 ADMIN_PASSWORD 创建默认 admin；ADMIN_USERNAME 可自定义', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xhs-boot-'));
    const app = await buildServer({
      dbPath: join(dir, 't.db'),
      env: { ADMIN_PASSWORD: 'custom-pass-123', ADMIN_USERNAME: 'boss' },
      logger: false,
    });
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'boss', password: 'custom-pass-123' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('admin');
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('bootstrap 弱密码（<8 位）拒绝启动', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xhs-boot-'));
    await expect(buildServer({ dbPath: join(dir, 't.db'), env: { ADMIN_PASSWORD: 'short' }, logger: false })).rejects.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('已有 admin 时不再要求 ADMIN_PASSWORD', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xhs-boot-'));
    const dbPath = join(dir, 't.db');
    const app1 = await buildServer({ dbPath, env: { ADMIN_PASSWORD: ADMIN_PASSWORD }, logger: false });
    await app1.close();
    const app2 = await buildServer({ dbPath, env: {}, logger: false });
    const res = await app2.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: ADMIN_PASSWORD } });
    expect(res.statusCode).toBe(200);
    await app2.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('登录/会话', () => {
  it('登录成功签发 httpOnly cookie，/api/auth/me 返回当前用户', async () => {
    t = await createTestApp();
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: ADMIN_PASSWORD } });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toMatch(/httponly/i);
    const cookie = setCookie.split(';')[0];
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('admin');
    expect(me.json().user.passwordHash).toBeUndefined();
  });

  it('错误密码 / 不存在用户 一律 401', async () => {
    t = await createTestApp();
    const r1 = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'wrong-pass-1' } });
    expect(r1.statusCode).toBe(401);
    const r2 = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ghost', password: 'wrong-pass-1' } });
    expect(r2.statusCode).toBe(401);
  });

  it('登出后原 cookie 失效（401）', async () => {
    t = await createTestApp();
    const cookie = await loginAs(t.app);
    const out = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('伪造 cookie 签名 → 401', async () => {
    t = await createTestApp();
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'xhs_session=abc.deadbeef' } });
    expect(me.statusCode).toBe(401);
  });

  it('连续 5 次失败登录后锁定（429），锁定期内正确密码也拒绝', async () => {
    t = await createTestApp();
    for (let i = 0; i < 5; i++) {
      await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: `bad-pass-${i}` } });
    }
    const locked = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: ADMIN_PASSWORD } });
    expect(locked.statusCode).toBe(429);
  });

  it('被禁用用户无法登录，已登录会话随之失效', async () => {
    t = await createTestApp();
    const admin = await loginAs(t.app);
    const member = await createMember(t.app, admin);
    const memberCookie = await loginAs(t.app, 'staff', 'staff-pass-123');
    const disable = await t.app.inject({
      method: 'PATCH',
      url: `/api/users/${member.id}`,
      headers: { cookie: admin },
      payload: { disable: true },
    });
    expect(disable.statusCode).toBe(200);
    const relogin = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'staff', password: 'staff-pass-123' } });
    expect(relogin.statusCode).toBe(403);
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: memberCookie } });
    expect(me.statusCode).toBe(401);
  });
});
