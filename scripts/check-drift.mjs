// 漂移检查（CI 门禁），分两半：
// ① SKILL.md schema 区块 vs drizzle migration —— 调 gen-skill-schema.mjs --check（漂移即红）
// ② server schema 枚举 ↔ 中文 label 双向对齐：schema.js 的 text(..., { enum }) 值
//    必须在 src/i18n.ts 有中文 label、在 SKILL.md 枚举区块有同含义的行；反向亦然。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const bad = (msg) => { console.error(`✗ ${msg}`); failed = true; };
const ok = (msg) => console.log(`✓ ${msg}`);

// ---- ① schema 区块漂移 ----
try {
  execFileSync(process.execPath, [join(root, 'scripts', 'gen-skill-schema.mjs'), '--check'], { stdio: 'pipe' });
  ok('SKILL.md schema 区块与 migration 无漂移');
} catch (e) {
  bad(`SKILL.md schema 区块与 migration 漂移：${String(e.stderr).trim()}（运行 node scripts/gen-skill-schema.mjs 修复）`);
}

// ---- ② 枚举 ↔ 中文 label 双向对齐 ----
// 枚举 → i18n 键前缀约定（与 src/i18n.ts / SKILL.md 枚举区块一一对应）
const ENUM_PREFIX = {
  'accounts.status': 'status',
  'customers.type': 'type',
  'ad_orders.channel': 'channel',
  'account_investments.type': 'inv',
  'operating_expenses.category': 'exp',
  'users.role': 'role',
  'pat_tokens.scope': 'scope',
};

const schemaSrc = readFileSync(join(root, 'server', 'db', 'schema.js'), 'utf8');
const i18nSrc = readFileSync(join(root, 'src', 'i18n.ts'), 'utf8');
const skillSrc = readFileSync(join(root, 'skills', 'xhs-matrix', 'SKILL.md'), 'utf8');

// schema.js：sqliteTable('table', { ... }) 块内的 text('col', { enum: [...] })
const schemaEnums = {}; // { 'table.column': ['a','b'] }
for (const tm of schemaSrc.matchAll(/sqliteTable\('(\w+)',\s*\{([\s\S]*?)\n\}\s*[,)]/g)) {
  const [, table, body] = tm;
  for (const em of body.matchAll(/text\('(\w+)',\s*\{\s*enum:\s*\[([^\]]+)\]\s*\}/g)) {
    schemaEnums[`${table}.${em[1]}`] = [...em[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
}

// i18n zh 区块（zh 在前，en 在其后）：key: '中文'
const zhSrc = i18nSrc.slice(0, i18nSrc.indexOf('const en'));
const i18nZh = {};
for (const m of zhSrc.matchAll(/^\s{2}(\w+):\s*'([^']*)',/gm)) i18nZh[m[1]] = m[2];

// SKILL.md 枚举区块：### `table.column` ... 下 | `value` | 含义 |
const skillEnums = {}; // { 'table.column': { value: meaning } }
{
  let cur = null;
  for (const line of skillSrc.split('\n')) {
    const hm = /^### `(\w+\.\w+)`/.exec(line);
    if (hm) { cur = hm[1]; skillEnums[cur] = skillEnums[cur] ?? {}; continue; }
    if (line.startsWith('### ') || line.startsWith('## ')) { if (!hm) cur = null; }
    if (!cur) continue;
    const rm = /^\| `([^`]+)` \| ([^|]+) \|/.exec(line);
    if (rm) skillEnums[cur][rm[1]] = rm[2].trim();
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// i18n label 可能带括号注解（如 '只读（read）'），比较时剥掉
const stripParen = (s) => s.replace(/（[^）]*）/g, '').trim();

let enumCount = 0;
for (const [key, prefix] of Object.entries(ENUM_PREFIX)) {
  const values = schemaEnums[key];
  if (!values) { bad(`schema.js 中找不到枚举 ${key}（约定前缀 ${prefix}*）`); continue; }
  enumCount += values.length;
  const skillRows = skillEnums[key];
  if (!skillRows) { bad(`SKILL.md 缺少枚举区块 ### \`${key}\``); continue; }
  for (const v of values) {
    const i18nKey = prefix + cap(v);
    const zh = i18nZh[i18nKey];
    if (!zh) bad(`i18n zh 缺少 ${i18nKey}（${key}=${v}）`);
    const skillMeaning = skillRows[v];
    if (!skillMeaning) { bad(`SKILL.md 枚举区块 ${key} 缺少值 \`${v}\``); continue; }
    if (zh && stripParen(zh) !== stripParen(skillMeaning)) {
      bad(`含义不一致：${key}=${v} → i18n「${zh}」 vs SKILL.md「${skillMeaning}」`);
    }
  }
  // 反向：SKILL.md 里的值必须都在 schema 枚举中
  for (const v of Object.keys(skillRows)) {
    if (!values.includes(v)) bad(`SKILL.md 枚举区块 ${key} 多出 schema 中不存在的值 \`${v}\``);
  }
}
if (!failed) ok(`枚举 ↔ 中文 label 双向对齐（${Object.keys(ENUM_PREFIX).length} 组 / ${enumCount} 个值）`);

if (failed) {
  console.error('check:drift: 存在漂移，见上');
  process.exit(1);
}
console.log('check:drift: 全部通过');
