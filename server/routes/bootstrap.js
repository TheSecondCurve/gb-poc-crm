// /api/bootstrap —— 前端启动一次性拉取：当前用户 + 设置 + 成员列表（负责人下拉用）
export default async function bootstrapRoutes(app) {
  app.get('/api/bootstrap', async (req) => {
    app.requireUser(req);
    const settings = Object.fromEntries(app.db.prepare("SELECT key, value FROM settings WHERE key IN ('idle_threshold_days', 'repurchase_threshold_days')").all().map((r) => [r.key, r.value]));
    const users = app.db.prepare(
      'SELECT id, username, display_name AS displayName, role, disabled_at AS disabledAt, created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY id',
    ).all();
    return { user: req.user, settings, users };
  });
}
