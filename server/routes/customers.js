// /api/customers —— 路由只做鉴权/参数解析/响应，业务逻辑在 engine/customers.js
import { createCustomer, listCustomers, getCustomerDetail, updateCustomer, softDeleteCustomer } from '../engine/customers.js';

export default async function customerRoutes(app) {
  app.get('/api/customers', async (req) => {
    app.requireAction(req, 'business.read');
    return { customers: listCustomers(app.db, req.query ?? {}) };
  });

  app.post('/api/customers', async (req) => {
    app.requireAction(req, 'business.write');
    return createCustomer(app.db, req.body ?? {}, req.user.id);
  });

  app.get('/api/customers/:id', async (req) => {
    app.requireAction(req, 'business.read');
    return { customer: getCustomerDetail(app.db, Number(req.params.id)) };
  });

  app.patch('/api/customers/:id', async (req) => {
    app.requireAction(req, 'business.write');
    return updateCustomer(app.db, Number(req.params.id), req.body ?? {}, req.user.id);
  });

  app.delete('/api/customers/:id', async (req) => {
    app.requireAction(req, 'business.write');
    softDeleteCustomer(app.db, Number(req.params.id), req.user.id);
    return { ok: true };
  });
}
