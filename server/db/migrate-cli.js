// CLI：npm run migrate —— 对 DB_PATH（默认 data/xhs.db）执行迁移
import { openDb } from './index.js';
import { migrate } from './migrate.js';

const dbPath = process.env.DB_PATH || 'data/xhs.db';
const db = openDb(dbPath);
migrate(db);
db.close();
console.log(`migrations applied to ${dbPath}`);
