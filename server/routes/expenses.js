// /api/expenses —— 运营费用（S7）
import { createExpense, listExpenses, getExpenseOrThrow, updateExpense, softDeleteExpense } from '../engine/expenses.js';

export default async function expenseRoutes(app) {
  app.get('/api/expenses', async (req) => {
    app.requireAction(req, 'business.read');
    return { expenses: listExpenses(app.db, req.query ?? {}) };
  });

  app.post('/api/expenses', async (req) => {
    app.requireAction(req, 'business.write');
    return createExpense(app.db, req.body ?? {}, req.user.id);
  });

  app.get('/api/expenses/:id', async (req) => {
    app.requireAction(req, 'business.read');
    return getExpenseOrThrow(app.db, Number(req.params.id));
  });

  app.patch('/api/expenses/:id', async (req) => {
    app.requireAction(req, 'business.write');
    return updateExpense(app.db, Number(req.params.id), req.body ?? {}, req.user.id);
  });

  app.delete('/api/expenses/:id', async (req) => {
    app.requireAction(req, 'business.write');
    softDeleteExpense(app.db, Number(req.params.id), req.user.id);
    return { ok: true };
  });
}
