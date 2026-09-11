// 用户管理（仅 admin）+ 审计日志查看的权限边界与分支
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember } from '../test/helpers.mjs';

let t, admin;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

async function setup() {
  t = await createTestApp();
  admin = await loginAs(t.app);
}

describe('用户管理权限', () => {
  it('member 访问用户管理一律 403；未登录 401', async () => {
    await setup();
    await createMember(t.app, admin);
    const staff = await loginAs(t.app, 'staff', 'staff-pass-123');
    expect((await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: staff } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: '/api/users', headers: { cookie: staff }, payload: {} })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/1', headers: { cookie: staff }, payload: {} })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(401);
  });

  it('建用户入参校验：重名 409 / 弱密码 400 / role 非法 400 / 缺字段 400', async () => {
    await setup();
    const post = (payload) => t.app.inject({ method: 'POST', url: '/api/users', headers: { cookie: admin }, payload });
    expect((await post({ username: 'admin', password: 'long-enough-1', displayName: 'x', role: 'member' })).statusCode).toBe(409);
    expect((await post({ username: 'u2', password: 'short', displayName: 'x', role: 'member' })).statusCode).toBe(400);
    expect((await post({ username: 'u2', password: 'long-enough-1', displayName: 'x', role: 'boss' })).statusCode).toBe(400);
    expect((await post({ username: '', password: 'long-enough-1', displayName: 'x', role: 'member' })).statusCode).toBe(400);
    expect((await post({ username: 'u2', password: 'long-enough-1', role: 'member' })).statusCode).toBe(400);
  });

  it('PATCH：改姓名 / 改角色 / 重置密码（旧密码失效、新密码可登录）', async () => {
    await setup();
    const member = await createMember(t.app, admin);
    const p1 = await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { displayName: '小张' } });
    expect(p1.json().displayName).toBe('小张');
    const p2 = await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { role: 'admin' } });
    expect(p2.json().role).toBe('admin');
    await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { password: 'new-pass-456' } });
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'staff', password: 'staff-pass-123' } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'staff', password: 'new-pass-456' } })).statusCode).toBe(200);
  });

  it('最后一名可用管理员不能禁用 / 降级；禁用后可重新启用', async () => {
    await setup();
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/1', headers: { cookie: admin }, payload: { disable: true } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/1', headers: { cookie: admin }, payload: { role: 'member' } })).statusCode).toBe(400);
    const member = await createMember(t.app, admin);
    await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { disable: true } });
    const back = await t.app.inject({ method: 'PATCH', url: `/api/users/${member.id}`, headers: { cookie: admin }, payload: { disable: false } });
    expect(back.json().disabledAt).toBeNull();
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'staff', password: 'staff-pass-123' } })).statusCode).toBe(200);
  });

  it('id 非法 400；用户不存在 404；PATCH role 非法 400', async () => {
    await setup();
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/abc', headers: { cookie: admin }, payload: { displayName: 'x' } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/999', headers: { cookie: admin }, payload: { displayName: 'x' } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'PATCH', url: '/api/users/1', headers: { cookie: admin }, payload: { role: 'root' } })).statusCode).toBe(400);
  });
});

describe('审计日志查看', () => {
  it('admin 可查审计日志；member 403；未登录 401', async () => {
    await setup();
    await createMember(t.app, admin);
    const res = await t.app.inject({ method: 'GET', url: '/api/audit-log', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries.length).toBeGreaterThan(0);
    expect(res.json().entries.some((e) => e.action === 'user.create')).toBe(true);
    const staff = await loginAs(t.app, 'staff', 'staff-pass-123');
    expect((await t.app.inject({ method: 'GET', url: '/api/audit-log', headers: { cookie: staff } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: '/api/audit-log' })).statusCode).toBe(401);
  });
});

describe('settings 分支', () => {
  it('GET 返回全部设置；非法 key / 非正整数 400', async () => {
    await setup();
    const res = await t.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    await t.app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie: admin }, payload: { key: 'idle_threshold_days', value: '45' } });
    const res2 = await t.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: admin } });
    expect(res2.json().settings.idle_threshold_days).toBe('45');
    expect((await t.app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie: admin }, payload: { key: 'session_secret', value: '1' } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie: admin }, payload: { key: 'idle_threshold_days', value: '-3' } })).statusCode).toBe(400);
  });
});
