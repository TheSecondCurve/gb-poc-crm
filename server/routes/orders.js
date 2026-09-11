// /api/orders —— 广告订单（S3）
import { createOrder, listOrders, getOrderOrThrow, updateOrder, softDeleteOrder } from '../engine/orders.js';

export default async function orderRoutes(app) {
  app.get('/api/orders', async (req) => {
    app.requireAction(req, 'business.read');
    return { orders: listOrders(app.db, req.query ?? {}) };
  });

  app.post('/api/orders', async (req) => {
    app.requireAction(req, 'business.write');
    return createOrder(app.db, req.body ?? {}, req.user.id);
  });

  app.get('/api/orders/:id', async (req) => {
    app.requireAction(req, 'business.read');
    return getOrderOrThrow(app.db, Number(req.params.id));
  });

  app.patch('/api/orders/:id', async (req) => {
    app.requireAction(req, 'business.write');
    return updateOrder(app.db, Number(req.params.id), req.body ?? {}, req.user.id);
  });

  app.delete('/api/orders/:id', async (req) => {
    app.requireAction(req, 'business.write');
    softDeleteOrder(app.db, Number(req.params.id), req.user.id);
    return { ok: true };
  });
}
