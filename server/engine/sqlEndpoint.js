// 单一 SQL 端点安全判定（agent-integration.md §5 照抄）：
// - 读写双条件：stmt.readonly === true 且 SQL 以 SELECT/WITH/VALUES 开头才算读，缺一落写分支
// - 鉴权在 prepare 之前（better-sqlite3 的 prepare 会立即执行 PRAGMA 改连接状态）
// - DDL / PRAGMA 等一律 403；单语句（better-sqlite3 prepare 原生拒绝多语句）
// - 读上限 1000 行截断；rows 用数组；凭据列 / sessions 表黑名单 403
import { httpError } from './errors.js';

const READ_KEYWORDS = new Set(['select', 'with', 'values']);
// DDL 与连接状态/库结构变更语句：任何令牌一律 403
const FORBIDDEN_KEYWORDS = new Set([
  'create', 'alter', 'drop', 'pragma', 'attach', 'detach', 'vacuum', 'reindex', 'analyze', 'truncate',
]);
const CREDENTIAL_COLUMNS = new Set(['password_hash', 'token_hash']);

export function stripLeadingComments(sql) {
  let s = sql;
  for (;;) {
    const t = s.trimStart();
    if (t.startsWith('--')) {
      const nl = t.indexOf('\n');
      if (nl === -1) return '';
      s = t.slice(nl + 1);
      continue;
    }
    if (t.startsWith('/*')) {
      const end = t.indexOf('*/');
      if (end === -1) throw httpError(400, 'bad_request', '块注释未闭合');
      s = t.slice(end + 2);
      continue;
    }
    return t;
  }
}

export function firstKeyword(sql) {
  const m = /^([A-Za-z]+)/.exec(stripLeadingComments(sql));
  return m ? m[1].toLowerCase() : '';
}

export function hitsBlacklist(sql) {
  return /\bsessions\b/i.test(sql);
}

// 执行入口：db 为 better-sqlite3 实例；auth = { scope }（已完成 PAT 鉴权）
export function executeAgentSql(db, { sql, params = [] }, auth) {
  if (typeof sql !== 'string' || !sql.trim()) throw httpError(400, 'bad_request', 'sql 必填');
  if (!Array.isArray(params)) throw httpError(400, 'bad_request', 'params 必须是数组');

  // 凭据黑名单在 prepare 之前判定
  if (hitsBlacklist(sql)) throw httpError(403, 'forbidden', '禁止访问 sessions 表');

  const keyword = firstKeyword(sql);
  if (FORBIDDEN_KEYWORDS.has(keyword)) throw httpError(403, 'forbidden', `禁止执行 ${keyword.toUpperCase()} 语句`);
  const readIntent = READ_KEYWORDS.has(keyword);
  // 非读意图 → 落写分支：鉴权（scope）在 prepare 之前
  if (!readIntent && auth.scope !== 'write') throw httpError(403, 'forbidden', '写操作需要 write scope 令牌');

  let stmt;
  try {
    stmt = db.prepare(sql); // 多语句在此被 better-sqlite3 原生拒绝
  } catch (err) {
    throw httpError(400, 'bad_request', `SQL 不合法：${err.message}`);
  }

  // 双条件复核：读意图但 readonly !== true（如 WITH ... DELETE）→ 落写分支
  const isRead = readIntent && stmt.readonly === true;

  if (isRead) {
    const columns = stmt.columns().map((c) => c.name);
    if (columns.some((c) => CREDENTIAL_COLUMNS.has(c.toLowerCase()))) {
      throw httpError(403, 'forbidden', '结果不得包含凭据列（password_hash / token_hash）');
    }
    const rows = stmt.raw().all(...params);
    const truncated = rows.length > 1000;
    return { type: 'read', columns, rows: truncated ? rows.slice(0, 1000) : rows, truncated };
  }

  // 写分支
  if (auth.scope !== 'write') throw httpError(403, 'forbidden', '写操作需要 write scope 令牌');
  try {
    const info = stmt.run(...params);
    return { type: 'write', changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  } catch (err) {
    throw httpError(400, 'bad_request', `执行失败：${err.message}`);
  }
}
