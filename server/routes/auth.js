// /api/auth/* 登录、登出、当前用户
import { COOKIE_NAME, SESSION_TTL_MS, signValue, createSession, destroySession, parseCookies, verifyPassword } from '../engine/auth.js';
import { audit } from '../engine/audit.js';
import { httpError } from '../engine/errors.js';

function sessionCookie(app, sessionId) {
  const parts = [
    `${COOKIE_NAME}=${sessionId}.${signValue(app.sessionSecret, sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (app.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export default async function authRoutes(app) {
  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw httpError(400, 'bad_request', '用户名与密码必填');
    }
    app.loginGuard.check(username);
    const row = app.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = row && (await verifyPassword(row.password_hash, password));
    if (!ok) {
      app.loginGuard.fail(username);
      throw httpError(401, 'invalid_credentials', '用户名或密码错误');
    }
    if (row.disabled_at) throw httpError(403, 'disabled', '账号已被禁用');
    app.loginGuard.succeed(username);
    const sessionId = createSession(app.db, row.id);
    audit(app.db, { userId: row.id, action: 'auth.login' });
    reply.header('set-cookie', sessionCookie(app, sessionId));
    return {
      user: { id: row.id, username: row.username, displayName: row.display_name, role: row.role },
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (raw) {
      const sessionId = raw.slice(0, raw.lastIndexOf('.'));
      destroySession(app.db, sessionId);
    }
    if (req.user) audit(app.db, { userId: req.user.id, action: 'auth.logout' });
    reply.header('set-cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    app.requireUser(req);
    return { user: req.user };
  });
}
