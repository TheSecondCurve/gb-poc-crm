// /api/metrics —— 页面看板取数（与 /api/v1/agent/metrics[/query] 调用同一份指标定义层代码）
import { listMetricCards, queryMetric } from '../engine/metrics.js';

export default async function metricsRoutes(app) {
  app.get('/api/metrics', async (req) => {
    app.requireAction(req, 'metrics.read');
    return { metrics: listMetricCards() };
  });

  app.post('/api/metrics/query', async (req) => {
    app.requireAction(req, 'metrics.read');
    const { metric, params } = req.body ?? {};
    return queryMetric(app.db, metric, params ?? {});
  });
}
