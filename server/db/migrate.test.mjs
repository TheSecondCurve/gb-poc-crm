// 迁移：幂等（跑两次）+ fresh 库全量迁移后可启动
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './index.js';
import { migrate } from './migrate.js';
import { buildServer } from '../app.js';

let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

describe('db 迁移', () => {
  it('迁移幂等：同一库连续跑两次不出错、结构完整', () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-mig-'));
    const db = openDb(join(dir, 't.db'));
    migrate(db);
    migrate(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
    for (const t of ['users', 'sessions', 'pat_tokens', 'accounts', 'customers', 'ad_orders', 'account_investments', 'operating_expenses', 'audit_log', 'settings']) {
      expect(tables).toContain(t);
    }
    db.close();
  });

  it('连接层 PRAGMA 生效：foreign_keys=ON / busy_timeout=5000 / WAL', () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-mig-'));
    const db = openDb(join(dir, 't.db'));
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });

  it('fresh 库全量迁移后应用可启动，未登录访问 /api/auth/me 返回 401', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-mig-'));
    const app = await buildServer({
      dbPath: join(dir, 'fresh.db'),
      env: { ADMIN_PASSWORD: 'admin-pass-123' },
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
