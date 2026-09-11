// /api/bootstrap：前端启动一次性拉取（当前用户 + 设置 + 成员列表）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, loginAs, createMember } from '../test/helpers.mjs';

let t;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

describe('GET /api/bootstrap', () => {
  it('未登录 401；登录后返回 user / settings / users', async () => {
    t = await createTestApp();
    expect((await t.app.inject({ method: 'GET', url: '/api/bootstrap' })).statusCode).toBe(401);
    const admin = await loginAs(t.app);
    await createMember(t.app, admin);
    await t.app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie: admin }, payload: { key: 'idle_threshold_days', value: '45' } });
    const res = await t.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('admin');
    expect(body.settings.idle_threshold_days).toBe('45');
    expect(body.users).toHaveLength(2);
    expect(body.users[0].passwordHash).toBeUndefined();
    expect(body.settings.session_secret).toBeUndefined();
  });
});
