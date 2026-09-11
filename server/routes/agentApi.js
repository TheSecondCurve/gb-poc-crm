// /api/v1/agent/* —— Agent 数据端点：仅 Bearer PAT（cookie 一律 403）
import { verifyToken } from '../engine/tokens.js';
import { executeAgentSql } from '../engine/sqlEndpoint.js';
import { listMetricCards, queryMetric } from '../engine/metrics.js';
import { audit } from '../engine/audit.js';
import { httpError } from '../engine/errors.js';

// Bearer PAT 鉴权：cookie 会话即使有效也一律 403
export function requirePat(app, req) {
  const authz = req.headers.authorization;
  if (typeof authz === 'string' && authz.startsWith('Bearer ')) {
    const verified = verifyToken(app.db, authz.slice(7));
    if (!verified) throw httpError(401, 'invalid_token', '令牌无效、已过期或已吊销');
    return verified;
  }
  if (req.user) throw httpError(403, 'forbidden', '该端点仅接受 Bearer PAT，cookie 会话不可用');
  throw httpError(401, 'unauthorized', '缺少 Bearer 令牌');
}

export default async function agentApiRoutes(app) {
  app.post('/api/v1/agent/sql', async (req) => {
    const auth = requirePat(app, req);
    const { sql, params } = req.body ?? {};
    const result = executeAgentSql(app.db, { sql, params }, auth);
    if (result.type === 'write') {
      audit(app.db, { userId: auth.user.id, action: 'agent.sql.write', detail: { sql: String(sql).slice(0, 500), changes: result.changes } });
    }
    return result;
  });

  // 指标目录：与页面 dashboard 同源同口径（analytics-design.md）
  app.get('/api/v1/agent/metrics', async (req) => {
    requirePat(app, req);
    return { metrics: listMetricCards() };
  });

  app.post('/api/v1/agent/metrics/query', async (req) => {
    requirePat(app, req);
    const { metric, params } = req.body ?? {};
    return queryMetric(app.db, metric, params ?? {});
  });
}
