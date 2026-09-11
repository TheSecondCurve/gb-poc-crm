// Drizzle 迁移执行器：按 meta/_journal.json 顺序应用 server/db/migrations/*.sql。
// 已应用的迁移记录在 _migrations 表，重复执行自动跳过（幂等）。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate(db, migrationsDir = MIGRATIONS_DIR) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8'));
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const insert = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) continue;
    const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    db.transaction(() => {
      for (const stmt of statements) db.exec(stmt);
      insert.run(entry.tag, Date.now());
    })();
  }
}
