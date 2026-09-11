// 认证引擎：argon2id 密码、session + HMAC 签名 cookie、bootstrap 管理员、登录失败锁定
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { httpError } from './errors.js';

export const COOKIE_NAME = 'xhs_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LEN = 8;

export function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
    throw httpError(400, 'weak_password', `密码至少 ${MIN_PASSWORD_LEN} 位`);
  }
}

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// bootstrap：零 admin 时必须提供 ADMIN_PASSWORD，否则拒绝启动
export async function bootstrapAdmin(db, env) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
  if (row.n > 0) return null;
  const password = env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD is required to bootstrap the first admin user');
  }
  assertPasswordStrength(password);
  const username = env.ADMIN_USERNAME || 'admin';
  const now = Date.now();
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)",
  ).run(username, await hashPassword(password), '管理员', now, now);
  return { id: Number(info.lastInsertRowid), username };
}

export function signValue(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function createSession(db, userId) {
  const id = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, now, now + SESSION_TTL_MS);
  return id;
}

export function destroySession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function destroyUserSessions(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

// 校验 cookie → 返回用户（camelCase 行）或 null
export function userFromCookie(db, secret, cookieHeader) {
  const raw = parseCookies(cookieHeader)[COOKIE_NAME];
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signValue(secret, sessionId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const row = db.prepare(
    `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.disabled_at AS disabledAt
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  ).get(sessionId, Date.now());
  if (!row || row.disabledAt) return null;
  return row;
}

// 登录失败锁定：单进程内存计数，5 次失败锁 15 分钟
export function createLoginGuard() {
  const fails = new Map();
  return {
    check(username) {
      const rec = fails.get(username);
      if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
        throw httpError(429, 'locked', '失败次数过多，账号已临时锁定，请稍后再试');
      }
    },
    fail(username) {
      const rec = fails.get(username) ?? { count: 0, lockedUntil: 0 };
      rec.count += 1;
      if (rec.count >= LOCK_THRESHOLD) rec.lockedUntil = Date.now() + LOCK_DURATION_MS;
      fails.set(username, rec);
    },
    succeed(username) {
      fails.delete(username);
    },
  };
}

// session 签名密钥：env 优先，否则生成一次并持久化到 settings（重启不失效）
export function loadSessionSecret(db, env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").get();
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('session_secret', ?)").run(secret);
  return secret;
}
