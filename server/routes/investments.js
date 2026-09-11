// /api/investments —— 账号投入（S2 投流；买入记录由 S1 自动生成）
import { createInvestment, listInvestments, getInvestmentOrThrow, updateInvestment, softDeleteInvestment } from '../engine/investments.js';

export default async function investmentRoutes(app) {
  app.get('/api/investments', async (req) => {
    app.requireAction(req, 'business.read');
    return { investments: listInvestments(app.db, req.query ?? {}) };
  });

  app.post('/api/investments', async (req) => {
    app.requireAction(req, 'business.write');
    return createInvestment(app.db, req.body ?? {}, req.user.id);
  });

  app.get('/api/investments/:id', async (req) => {
    app.requireAction(req, 'business.read');
    return getInvestmentOrThrow(app.db, Number(req.params.id));
  });

  app.patch('/api/investments/:id', async (req) => {
    app.requireAction(req, 'business.write');
    return updateInvestment(app.db, Number(req.params.id), req.body ?? {}, req.user.id);
  });

  app.delete('/api/investments/:id', async (req) => {
    app.requireAction(req, 'business.write');
    softDeleteInvestment(app.db, Number(req.params.id), req.user.id);
    return { ok: true };
  });
}
