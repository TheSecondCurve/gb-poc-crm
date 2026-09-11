// /api/audit-log —— 审计日志查看（仅 admin：audit.read）
export default async function auditRoutes(app) {
  app.get('/api/audit-log', async (req) => {
    app.requireAction(req, 'audit.read');
    const rows = app.db.prepare(
      `SELECT a.id, a.user_id AS userId, u.username, a.action, a.target_type AS targetType,
              a.target_id AS targetId, a.detail, a.created_at AS createdAt
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 500`,
    ).all();
    return { entries: rows };
  });
}
