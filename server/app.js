// Fastify 应用装配：db → migrate → bootstrap admin → 会话钩子 → 路由。
// 测试通过 buildServer + inject 直调（不 listen）。
import Fastify from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { bootstrapAdmin, userFromCookie, loadSessionSecret, createLoginGuard } from './engine/auth.js';
import { can } from './engine/permissions.js';
import { httpError } from './engine/errors.js';
import authRoutes from './routes/auth.js';
import tokenRoutes from './routes/tokens.js';
import userRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import agentApiRoutes from './routes/agentApi.js';
import accountRoutes from './routes/accounts.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';
import investmentRoutes from './routes/investments.js';
import expenseRoutes from './routes/expenses.js';
import metricsRoutes from './routes/metrics.js';
import settingsRoutes from './routes/settings.js';
import adminRoutes from './routes/admin.js';
import agentFileRoutes from './routes/agentFiles.js';
import bootstrapRoutes from './routes/bootstrap.js';
import { makeStaticHandler } from './static.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SKILLS_DIR = join(PROJECT_ROOT, 'skills', 'xhs-matrix');
const DEFAULT_DIST_DIR = join(PROJECT_ROOT, 'dist');

export async function buildServer({ dbPath, env = process.env, logger = false, skillsDir = DEFAULT_SKILLS_DIR, distDir = DEFAULT_DIST_DIR } = {}) {
  const db = openDb(dbPath);
  migrate(db);
  await bootstrapAdmin(db, env);
  const sessionSecret = loadSessionSecret(db, env);

  const app = Fastify({ logger });
  app.decorate('db', db);
  app.decorate('sessionSecret', sessionSecret);
  app.decorate('loginGuard', createLoginGuard());
  app.decorate('cookieSecure', env.COOKIE_SECURE === '1');

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    req.user = userFromCookie(db, sessionSecret, req.headers.cookie);
  });

  // 每个 handler 的权限边界（前端隐藏按钮只是体验，不是安全边界）
  app.decorate('requireUser', (req) => {
    if (!req.user) throw httpError(401, 'unauthorized', '未登录或会话已失效');
  });
  app.decorate('requireAction', (req, action) => {
    if (!req.user) throw httpError(401, 'unauthorized', '未登录或会话已失效');
    if (!can(req.user, action)) throw httpError(403, 'forbidden', '无权限执行该操作');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.expose) return reply.code(err.statusCode).send(err.expose);
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'error', message: err.message });
    }
    req.log?.error(err);
    return reply.code(500).send({ error: 'internal', message: '服务器内部错误' });
  });

  const staticHandler = makeStaticHandler(distDir);
  app.setNotFoundHandler((req, reply) => {
    if (staticHandler) return staticHandler(req, reply);
    reply.code(404).send({ error: 'not_found', message: '资源不存在' });
  });

  await app.register(authRoutes);
  await app.register(tokenRoutes);
  await app.register(userRoutes);
  await app.register(auditRoutes);
  await app.register(agentApiRoutes);
  await app.register(accountRoutes);
  await app.register(customerRoutes);
  await app.register(orderRoutes);
  await app.register(investmentRoutes);
  await app.register(expenseRoutes);
  await app.register(metricsRoutes);
  await app.register(settingsRoutes);
  await app.register(adminRoutes);
  await app.register(agentFileRoutes, { skillsDir });
  await app.register(bootstrapRoutes);

  app.addHook('onClose', async () => db.close());
  return app;
}
