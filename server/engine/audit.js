// 审计日志：关键操作（删除、令牌签发/吊销、登录、用户管理）记录谁、何时、对什么、做了什么。
// 库内永久保留、不主动清理（K2）。
export function audit(db, { userId = null, action, targetType = null, targetId = null, detail = null }) {
  db.prepare(
    'INSERT INTO audit_log (user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, action, targetType, targetId == null ? null : String(targetId), detail ? JSON.stringify(detail) : null, Date.now());
}
