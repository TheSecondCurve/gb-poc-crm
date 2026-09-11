// PAT 令牌引擎：只存 sha256 hash，库内留前缀用于展示/吊销定位；read/write scope；90 天过期；
// 吊销置 revoked_at + revoked_by 不删行；禁用用户联动撤销其全部令牌
import crypto from 'node:crypto';

export const TOKEN_TTL_MS = 90 * 24 * 3600 * 1000;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueToken(db, { userId, scope }) {
  const token = `xhp_${crypto.randomBytes(24).toString('base64url')}`;
  const prefix = token.slice(4, 12);
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;
  const info = db.prepare(
    'INSERT INTO pat_tokens (user_id, token_hash, prefix, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, hashToken(token), prefix, scope, expiresAt, now);
  return { id: Number(info.lastInsertRowid), token, prefix, scope, expiresAt, createdAt: now };
}

// 校验 Bearer PAT：hash 命中 + 未吊销 + 未过期 + 用户未禁用
export function verifyToken(db, token) {
  if (typeof token !== 'string' || !token.startsWith('xhp_')) return null;
  const row = db.prepare(
    `SELECT t.id AS tokenId, t.scope, u.id, u.username, u.display_name AS displayName, u.role, u.disabled_at AS disabledAt
     FROM pat_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > ?`,
  ).get(hashToken(token), Date.now());
  if (!row || row.disabledAt) return null;
  return {
    user: { id: row.id, username: row.username, displayName: row.displayName, role: row.role, disabledAt: row.disabledAt },
    tokenId: row.tokenId,
    scope: row.scope,
  };
}

export function revokeToken(db, tokenId, revokedBy) {
  db.prepare('UPDATE pat_tokens SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL')
    .run(Date.now(), revokedBy, tokenId);
}

export function revokeUserTokens(db, userId, revokedBy) {
  db.prepare('UPDATE pat_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(Date.now(), revokedBy, userId);
}

export function listTokens(db, { userId, all = false }) {
  const base = `SELECT t.id, t.user_id AS userId, u.username, t.prefix, t.scope, t.expires_at AS expiresAt,
                t.revoked_at AS revokedAt, t.revoked_by AS revokedBy, t.created_at AS createdAt
                FROM pat_tokens t JOIN users u ON u.id = t.user_id`;
  if (all) return db.prepare(`${base} ORDER BY t.id DESC`).all();
  return db.prepare(`${base} WHERE t.user_id = ? ORDER BY t.id DESC`).all(userId);
}

export function getToken(db, tokenId) {
  return db.prepare('SELECT id, user_id AS userId, revoked_at AS revokedAt FROM pat_tokens WHERE id = ?').get(tokenId);
}
