// /api/users —— 用户管理（仅 admin：user.manage）
import { hashPassword, assertPasswordStrength, destroyUserSessions } from '../engine/auth.js';
import { revokeUserTokens } from '../engine/tokens.js';
import { audit } from '../engine/audit.js';
import { httpError } from '../engine/errors.js';

const USER_COLS = 'id, username, display_name AS displayName, role, disabled_at AS disabledAt, created_at AS createdAt, updated_at AS updatedAt';

export default async function userRoutes(app) {
  app.addHook('preHandler', async (req) => app.requireAction(req, 'user.manage'));

  app.get('/api/users', async () => {
    return { users: app.db.prepare(`SELECT ${USER_COLS} FROM users ORDER BY id`).all() };
  });

  app.post('/api/users', async (req) => {
    const { username, password, displayName, role } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim()) throw httpError(400, 'bad_request', '用户名必填');
    if (typeof displayName !== 'string' || !displayName.trim()) throw httpError(400, 'bad_request', '姓名必填');
    if (!['admin', 'member'].includes(role)) throw httpError(400, 'bad_request', "role 只能为 'admin' 或 'member'");
    assertPasswordStrength(password);
    const dup = app.db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (dup) throw httpError(409, 'conflict', '用户名已存在');
    const now = Date.now();
    const info = app.db.prepare(
      'INSERT INTO users (username, password_hash, display_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(username.trim(), await hashPassword(password), displayName.trim(), role, now, now);
    audit(app.db, { userId: req.user.id, action: 'user.create', targetType: 'user', targetId: info.lastInsertRowid, detail: { username: username.trim(), role } });
    return app.db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(info.lastInsertRowid);
  });

  app.patch('/api/users/:id', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw httpError(400, 'bad_request', 'id 非法');
    const target = app.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw httpError(404, 'not_found', '用户不存在');
    const { displayName, role, password, disable } = req.body ?? {};

    const demotingAdmin = target.role === 'admin' && ((role && role !== 'admin') || disable === true);
    if (demotingAdmin) {
      const others = app.db.prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id != ?",
      ).get(id);
      if (others.n === 0) throw httpError(400, 'bad_request', '系统至少保留一名可用管理员');
    }
    if (role && !['admin', 'member'].includes(role)) throw httpError(400, 'bad_request', "role 只能为 'admin' 或 'member'");

    const now = Date.now();
    if (typeof displayName === 'string' && displayName.trim()) {
      app.db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(displayName.trim(), now, id);
    }
    if (role) {
      app.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);
    }
    if (password !== undefined) {
      assertPasswordStrength(password);
      app.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(password), now, id);
      destroyUserSessions(app.db, id);
      revokeUserTokens(app.db, id, req.user.id);
      audit(app.db, { userId: req.user.id, action: 'user.resetPassword', targetType: 'user', targetId: id });
    }
    if (disable === true && !target.disabled_at) {
      app.db.prepare('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      // 禁用联动：会话全部失效 + PAT 全部吊销
      destroyUserSessions(app.db, id);
      revokeUserTokens(app.db, id, req.user.id);
      audit(app.db, { userId: req.user.id, action: 'user.disable', targetType: 'user', targetId: id });
    }
    if (disable === false && target.disabled_at) {
      app.db.prepare('UPDATE users SET disabled_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
      audit(app.db, { userId: req.user.id, action: 'user.enable', targetType: 'user', targetId: id });
    }
    return app.db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id);
  });
}
