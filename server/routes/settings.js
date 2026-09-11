// /api/settings —— 可调阈值（白名单 key，正整数）
import { httpError } from '../engine/errors.js';
import { audit } from '../engine/audit.js';

const ALLOWED_KEYS = ['idle_threshold_days', 'repurchase_threshold_days'];

export default async function settingsRoutes(app) {
  app.get('/api/settings', async (req) => {
    app.requireAction(req, 'business.read');
    const rows = app.db.prepare('SELECT key, value FROM settings').all();
    return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  });

  app.patch('/api/settings', async (req) => {
    app.requireAction(req, 'business.write');
    const { key, value } = req.body ?? {};
    if (!ALLOWED_KEYS.includes(key)) throw httpError(400, 'bad_request', `key 只能为：${ALLOWED_KEYS.join(' / ')}`);
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'bad_request', 'value 必须为正整数（天）');
    app.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(n));
    audit(app.db, { userId: req.user.id, action: 'settings.update', targetType: 'setting', targetId: key, detail: { value: n } });
    return { key, value: String(n) };
  });
}
