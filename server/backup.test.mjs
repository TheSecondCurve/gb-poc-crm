// 备份恢复冒烟（engineering-standards §4 必测项）：
// 跑 scripts/backup.sh 产出 .backup.gz → 从备份重建库 → 启动应用 → 关键查询通过。
// 备份只用 sqlite3 .backup，禁止 cp 热库；本测试同时验证滚动清理逻辑不删新备份。
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './app.js';
import { ADMIN_PASSWORD, loginAs } from './test/helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_SH = join(root, 'scripts', 'backup.sh');

let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

describe('备份恢复冒烟', () => {
  it('backup.sh 备份 → gunzip 重建 → 新库启动应用 → 数据完整可查', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-backup-'));
    const dbPath = join(dir, 'app.db');
    const backupDir = join(dir, 'backups');

    // 1) 源库：启动应用并写入业务数据
    const app1 = await buildServer({ dbPath, env: { ADMIN_PASSWORD }, logger: false });
    const cookie = await loginAs(app1);
    const create = await app1.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie },
      payload: { name: '备份冒烟账号', category: '美妆', purchaseCostCents: 150000, purchasedAt: 1789000000000 },
    });
    expect(create.statusCode).toBe(200);
    await app1.close();

    // 2) 跑 backup.sh（.backup + gzip + chmod 600）
    execFileSync('sh', [BACKUP_SH], { env: { ...process.env, DB_PATH: dbPath, BACKUP_DIR: backupDir, RETENTION_DAYS: '30' } });
    const backups = readdirSync(backupDir).filter((f) => f.endsWith('.db.gz'));
    expect(backups).toHaveLength(1);

    // 3) 从备份重建库到全新路径
    const restoredPath = join(dir, 'restored.db');
    execFileSync('sh', ['-c', `gunzip -c "$1" > "$2"`, 'sh', join(backupDir, backups[0]), restoredPath]);

    // 4) 新库启动应用：迁移幂等 + 关键查询通过
    const app2 = await buildServer({ dbPath: restoredPath, env: { ADMIN_PASSWORD }, logger: false });
    try {
      const cookie2 = await loginAs(app2);
      const list = await app2.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: cookie2 } });
      expect(list.statusCode).toBe(200);
      const names = list.json().accounts.map((a) => a.name);
      expect(names).toContain('备份冒烟账号');
      // 恢复后的库可继续写入
      const again = await app2.inject({
        method: 'POST', url: '/api/accounts', headers: { cookie: cookie2 },
        payload: { name: '恢复后新账号', category: '穿搭', purchaseCostCents: 100, purchasedAt: 1789000000000 },
      });
      expect(again.statusCode).toBe(200);
    } finally {
      await app2.close();
    }

    // 5) 备份文件权限 600
    const { statSync } = await import('node:fs');
    expect((statSync(join(backupDir, backups[0])).mode & 0o777).toString(8)).toBe('600');
  });

  it('滚动清理：超过保留天数的旧备份被删除，新备份保留', async () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-backup-rotate-'));
    const dbPath = join(dir, 'app.db');
    const backupDir = join(dir, 'backups');
    const app = await buildServer({ dbPath, env: { ADMIN_PASSWORD }, logger: false });
    await app.close();

    // 预置一个 40 天前的旧备份（mtime 造假）
    const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
    mkdirSync(backupDir, { recursive: true });
    const oldFile = join(backupDir, 'xhs-2000-01-01.db.gz');
    writeFileSync(oldFile, 'old');
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    utimesSync(oldFile, old, old);

    execFileSync('sh', [BACKUP_SH], { env: { ...process.env, DB_PATH: dbPath, BACKUP_DIR: backupDir, RETENTION_DAYS: '30' } });
    const left = readdirSync(backupDir);
    expect(left.some((f) => f.endsWith('.db.gz') && f !== 'xhs-2000-01-01.db.gz')).toBe(true);
    expect(existsSync(oldFile)).toBe(false);
  });
});
