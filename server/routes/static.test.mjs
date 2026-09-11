// 生产模式静态托管：dist/ 存在时由 Fastify 直接发 index.html 与静态资源
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../app.js';

let dir, app;
afterEach(async () => {
  if (app) await app.close(); app = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined;
});

async function appWithDist(withIndex = true) {
  dir = mkdtempSync(join(tmpdir(), 'xhs-dist-'));
  const distDir = join(dir, 'dist');
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  if (withIndex) writeFileSync(join(distDir, 'index.html'), '<html><body>SPA</body></html>');
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log(1)');
  app = await buildServer({
    dbPath: join(dir, 'test.db'),
    env: { ADMIN_PASSWORD: 'admin-pass-123' },
    logger: false,
    distDir,
  });
  return { app, distDir };
}

describe('dist 静态托管', () => {
  it('GET / 返回 index.html；GET /assets/app.js 返回 JS；hash 路由无需 fallback', async () => {
    await appWithDist();
    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toContain('text/html');
    expect(root.body).toContain('SPA');
    const js = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
  });

  it('API 404 不被静态托管吞掉；路径穿越拒绝', async () => {
    await appWithDist();
    const api = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error).toBe('not_found');
    const evil = await app.inject({ method: 'GET', url: '/..%2Fpackage.json' });
    expect([400, 404]).toContain(evil.statusCode);
  });

  it('dist 缺失（无 index.html）时 API 照常工作，GET / 返回 404 JSON', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-nodist-'));
    app = await buildServer({
      dbPath: join(dir, 'test.db'),
      env: { ADMIN_PASSWORD: 'admin-pass-123' },
      logger: false,
      distDir: join(dir, 'no-such-dir'),
    });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
  });
});
