// 连接层：better-sqlite3 + PRAGMA（WAL / busy_timeout=5000 / foreign_keys=ON，不写进 migration）
// 库文件 chmod 600（:memory: 跳过）
import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  if (path !== ':memory:') {
    try {
      chmodSync(path, 0o600);
    } catch {
      // 文件刚创建尚未落盘等极端情况，不阻塞启动
    }
  }
  return db;
}
