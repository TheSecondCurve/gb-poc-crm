// /api/v1/auth/tokens —— PAT 签发（用户名+密码，供 login.sh / 自助）与自助管理
import { issueToken, listTokens, getToken, revokeToken } from '../engine/tokens.js';
import { verifyPassword } from '../engine/auth.js';
import { audit } from '../engine/audit.js';
import { can } from '../engine/permissions.js';
import { httpError } from '../engine/errors.js';

export default async function tokenRoutes(app) {
  // 签发：用户名+密码换 PAT（密码只应经终端交互提交，见 agent-integration.md）
  app.post('/api/v1/auth/tokens', async (req) => {
    const { username, password, scope = 'read' } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw httpError(400, 'bad_request', '用户名与密码必填');
    }
    if (!['read', 'write'].includes(scope)) throw httpError(400, 'bad_request', "scope 只能为 'read' 或 'write'");
    app.loginGuard.check(username);
    const row = app.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = row && (await verifyPassword(row.password_hash, password));
    if (!ok) {
      app.loginGuard.fail(username);
      throw httpError(401, 'invalid_credentials', '用户名或密码错误');
    }
    if (row.disabled_at) throw httpError(403, 'disabled', '账号已被禁用');
    app.loginGuard.succeed(username);
    const issued = issueToken(app.db, { userId: row.id, scope });
    audit(app.db, { userId: row.id, action: 'token.issue', targetType: 'pat_token', targetId: issued.id, detail: { scope, prefix: issued.prefix } });
    return issued;
  });

  // 列表：本人令牌；admin 带 ?all=1 可查全部
  app.get('/api/v1/auth/tokens', async (req) => {
    app.requireUser(req);
    const all = req.query?.all === '1' && can(req.user, 'token.revokeAny');
    return { tokens: listTokens(app.db, { userId: req.user.id, all }) };
  });

  // 吊销：本人任意吊销；吊销他人需 admin（token.revokeAny）
  app.delete('/api/v1/auth/tokens/:id', async (req) => {
    app.requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw httpError(400, 'bad_request', 'id 非法');
    const row = getToken(app.db, id);
    if (!row) throw httpError(404, 'not_found', '令牌不存在');
    if (row.userId !== req.user.id && !can(req.user, 'token.revokeAny')) {
      throw httpError(403, 'forbidden', '只能吊销本人的令牌');
    }
    revokeToken(app.db, id, req.user.id);
    audit(app.db, { userId: req.user.id, action: 'token.revoke', targetType: 'pat_token', targetId: id });
    return { ok: true };
  });
}
