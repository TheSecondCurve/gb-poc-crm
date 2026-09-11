// SQL 端点对抗用例（engineering-standards §4 必测清单）
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, issuePat } from '../test/helpers.mjs';

let t, readPat, writePat;
afterEach(async () => { if (t) await t.cleanup(); t = undefined; });

async function setup() {
  t = await createTestApp();
  readPat = await issuePat(t.app, { scope: 'read' });
  writePat = await issuePat(t.app, { scope: 'write' });
}

function sql(statement, token = readPat.token, params) {
  return t.app.inject({
    method: 'POST', url: '/api/v1/agent/sql',
    headers: { authorization: `Bearer ${token}` },
    payload: { sql: statement, params },
  });
}

describe('读路径', () => {
  it('SELECT 返回 columns + rows 数组（省 token）', async () => {
    await setup();
    const res = await sql("SELECT 1 AS a, 'x' AS b");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ type: 'read', columns: ['a', 'b'], rows: [[1, 'x']], truncated: false });
  });

  it('VALUES 开头算读；参数绑定可用', async () => {
    await setup();
    const res = await sql('VALUES (?, ?)', readPat.token, [1, 'a']);
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([[1, 'a']]);
  });

  it('读上限 1000 行截断', async () => {
    await setup();
    const res = await sql('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1005) SELECT x FROM c');
    expect(res.statusCode).toBe(200);
    expect(res.json().truncated).toBe(true);
    expect(res.json().rows).toHaveLength(1000);
  });
});

describe('对抗用例', () => {
  it('注释前缀绕过：-- / /* */ 后的 DDL 仍 403', async () => {
    await setup();
    expect((await sql('-- harmless\nDROP TABLE users', writePat.token)).statusCode).toBe(403);
    expect((await sql('/* harmless */ DROP TABLE users', writePat.token)).statusCode).toBe(403);
    expect((await sql('  -- x\n  /* y */  CREATE TABLE evil (a)', writePat.token)).statusCode).toBe(403);
  });

  it('WITH ... DELETE 落写分支：read scope 403', async () => {
    await setup();
    const res = await sql('WITH x AS (SELECT 1) DELETE FROM customers WHERE id IN (SELECT * FROM x)');
    expect(res.statusCode).toBe(403);
  });

  it('多语句被拒绝（400）', async () => {
    await setup();
    expect((await sql('SELECT 1; SELECT 2')).statusCode).toBe(400);
    expect((await sql('SELECT 1; DROP TABLE users', writePat.token)).statusCode).toBe(400);
  });

  it('PRAGMA 一律 403（prepare 会立即执行，鉴权必须在 prepare 之前）', async () => {
    await setup();
    expect((await sql('PRAGMA journal_mode = DELETE', writePat.token)).statusCode).toBe(403);
    // 连接状态未被改动
    expect(t.db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('SELECTX 前缀误判：非 SELECT 开头不落读分支', async () => {
    await setup();
    // SELECTX 不是合法语句：read scope 按写分支判 → 403；write scope prepare 失败 → 400
    expect((await sql('SELECTX 1')).statusCode).toBe(403);
    expect((await sql('SELECTX 1', writePat.token)).statusCode).toBe(400);
  });

  it('凭据列 / sessions 表黑名单 403', async () => {
    await setup();
    expect((await sql('SELECT password_hash FROM users')).statusCode).toBe(403);
    expect((await sql('SELECT token_hash FROM pat_tokens')).statusCode).toBe(403);
    expect((await sql('SELECT * FROM sessions')).statusCode).toBe(403);
    expect((await sql('SELECT * FROM users u JOIN sessions s ON s.user_id = u.id')).statusCode).toBe(403);
    // 不误伤：普通业务表可读
    expect((await sql('SELECT id, username, role FROM users')).statusCode).toBe(200);
  });

  it('DDL 对任何令牌一律 403', async () => {
    await setup();
    for (const ddl of ['CREATE TABLE t (a)', 'ALTER TABLE users ADD COLUMN x TEXT', 'DROP TABLE users', 'ATTACH DATABASE "/tmp/x" AS x']) {
      expect((await sql(ddl, writePat.token)).statusCode).toBe(403);
    }
  });
});

describe('写路径', () => {
  it('read scope 写操作 403；write scope 写成功并返回 changes/lastInsertRowid', async () => {
    await setup();
    expect((await sql("UPDATE customers SET note = 'x' WHERE id = 1")).statusCode).toBe(403);
    const ins = await sql("INSERT INTO customers (name, type, created_at, updated_at) VALUES ('sql客户', 'brand', 1, 1)", writePat.token);
    expect(ins.statusCode).toBe(200);
    expect(ins.json().type).toBe('write');
    expect(ins.json().changes).toBe(1);
    const back = await sql('SELECT name FROM customers WHERE id = ?', readPat.token, [ins.json().lastInsertRowid]);
    expect(back.json().rows).toEqual([['sql客户']]);
  });

  it('写操作写审计日志（agent.sql.write）', async () => {
    await setup();
    await sql("INSERT INTO customers (name, type, created_at, updated_at) VALUES ('x', 'brand', 1, 1)", writePat.token);
    const row = t.db.prepare("SELECT * FROM audit_log WHERE action = 'agent.sql.write'").get();
    expect(row).toBeTruthy();
  });
});
