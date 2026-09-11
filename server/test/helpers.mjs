// 测试公共助手：每个测试一个临时 SQLite 库 + fastify inject 直调（不 listen、不 mock 数据库）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../app.js';

export const ADMIN_PASSWORD = 'admin-pass-123';

export async function createTestApp({ env = {}, dbPath } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-test-'));
  const app = await buildServer({
    dbPath: dbPath ?? join(dir, 'test.db'),
    env: { ADMIN_PASSWORD: ADMIN_PASSWORD, ...env },
    logger: false,
  });
  return {
    app,
    dir,
    db: app.db,
    async cleanup() {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function loginAs(app, username = 'admin', password = ADMIN_PASSWORD) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  return setCookie.split(';')[0];
}

export async function createMember(app, adminCookie, { username = 'staff', password = 'staff-pass-123', displayName = '员工' } = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie: adminCookie },
    payload: { username, password, displayName, role: 'member' },
  });
  if (res.statusCode !== 200) throw new Error(`createMember failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

export async function issuePat(app, { username = 'admin', password = ADMIN_PASSWORD, scope = 'write' } = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/tokens',
    payload: { username, password, scope },
  });
  if (res.statusCode !== 200) throw new Error(`issuePat failed: ${res.statusCode} ${res.body}`);
  return res.json();
}
