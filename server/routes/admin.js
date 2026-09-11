// /api/admin/* —— 管理员工具：S10 初始化演示数据 / S11 清除全部业务数据（均仅 admin）
import { hasBusinessData, seedDemo, wipeBusinessData } from '../engine/seedDemo.js';
import { audit } from '../engine/audit.js';
import { httpError } from '../engine/errors.js';

export default async function adminRoutes(app) {
  // S10：一次性事务写入演示数据；已有任何业务数据时 409（幂等防护，防重复堆积污染真实数据）
  app.post('/api/admin/seed-demo', async (req) => {
    app.requireAction(req, 'admin.seed');
    if (hasBusinessData(app.db)) {
      throw httpError(409, 'conflict', '库中已有业务数据：请先在「设置 → 危险区」清除全部业务数据，再初始化演示数据');
    }
    const stats = seedDemo(app.db, { userId: req.user.id });
    audit(app.db, { userId: req.user.id, action: 'admin.seed', detail: stats });
    return { stats };
  });

  // S11：物理清空五张业务表（K5：软删规则的显式例外）；users/settings/pat_tokens/sessions 保留
  app.post('/api/admin/wipe-data', async (req) => {
    app.requireAction(req, 'admin.wipe');
    wipeBusinessData(app.db);
    audit(app.db, { userId: req.user.id, action: 'admin.wipe' });
    return { ok: true };
  });
}
