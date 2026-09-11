// 生产入口：node server/index.js
import { buildServer } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const dbPath = process.env.DB_PATH || 'data/xhs.db';

const app = await buildServer({ dbPath, env: process.env, logger: true });
await app.listen({ port, host });
