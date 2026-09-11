// migrate CLI 冒烟：npm run migrate 对 DB_PATH 执行迁移，跑两次幂等
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'migrate-cli.js');
let dir;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

describe('migrate CLI', () => {
  it('对 fresh 库执行成功，跑两次幂等，库文件权限 600', () => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-cli-'));
    const dbPath = join(dir, 'cli.db');
    const env = { ...process.env, DB_PATH: dbPath };
    const out1 = execFileSync('node', [CLI], { env }).toString();
    expect(out1).toContain('migrations applied');
    const out2 = execFileSync('node', [CLI], { env }).toString();
    expect(out2).toContain('migrations applied');
    const mode = statSync(dbPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
