// /api/accounts —— 路由只做鉴权/参数解析/响应，业务逻辑在 engine/accounts.js
import { createAccount, listAccounts, getAccountDetail, updateAccount, softDeleteAccount } from '../engine/accounts.js';

export default async function accountRoutes(app) {
  app.get('/api/accounts', async (req) => {
    app.requireAction(req, 'business.read');
    return { accounts: listAccounts(app.db, req.query ?? {}) };
  });

  app.post('/api/accounts', async (req) => {
    app.requireAction(req, 'business.write');
    return createAccount(app.db, req.body ?? {}, req.user.id);
  });

  app.get('/api/accounts/:id', async (req) => {
    app.requireAction(req, 'business.read');
    return { account: getAccountDetail(app.db, Number(req.params.id)) };
  });

  app.patch('/api/accounts/:id', async (req) => {
    app.requireAction(req, 'business.write');
    return updateAccount(app.db, Number(req.params.id), req.body ?? {}, req.user.id);
  });

  app.delete('/api/accounts/:id', async (req) => {
    app.requireAction(req, 'business.write');
    softDeleteAccount(app.db, Number(req.params.id), req.user.id);
    return { ok: true };
  });
}
