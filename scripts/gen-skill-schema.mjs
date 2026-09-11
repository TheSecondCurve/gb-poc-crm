// 从 drizzle migration SQL 半自动生成 SKILL.md 的 schema 文档区块。
// 列结构（表/列/类型/约束/外键）自动同步；「含义」列手写保留——重跑时从 SKILL.md 现有区块回收，
// 新列先填 DEFAULT_MEANINGS 里的默认值，没有则标「⚠ 待补充」。
// 用法：node scripts/gen-skill-schema.mjs        —— 就地更新 SKILL.md schema 区块
//       node scripts/gen-skill-schema.mjs --check —— 只校验不写入，漂移即 exit 1（CI 用）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_MD = join(root, 'skills', 'xhs-matrix', 'SKILL.md');
const MIGRATIONS_DIR = join(root, 'server', 'db', 'migrations');

export const SCHEMA_BEGIN = '<!-- SCHEMA:BEGIN -->';
export const SCHEMA_END = '<!-- SCHEMA:END -->';

// 新列的默认含义（表.列 → 中文）。手写改 SKILL.md 里的含义列即可，重跑不会覆盖。
const DEFAULT_MEANINGS = {
  'users': '系统用户（登录与审计主体）',
  'users.id': '主键',
  'users.username': '登录名（唯一）',
  'users.password_hash': '⚠ 凭据列，SQL 端点黑名单禁止查询',
  'users.display_name': '显示名',
  'users.role': '角色枚举：admin=管理员 / member=成员',
  'users.disabled_at': '禁用时间（epoch ms），非空即禁用',
  'sessions': '登录会话（SQL 端点黑名单表，禁止查询）',
  'sessions.id': '会话 ID（签名 cookie 值）',
  'sessions.user_id': '所属用户 → users.id',
  'sessions.expires_at': '过期时间（epoch ms）',
  'pat_tokens': 'Agent 访问令牌（PAT）',
  'pat_tokens.user_id': '所属用户 → users.id',
  'pat_tokens.token_hash': '⚠ 凭据列，SQL 端点黑名单禁止查询',
  'pat_tokens.prefix': '令牌前缀（展示与吊销定位用）',
  'pat_tokens.scope': '权限枚举：read=只读 / write=读写',
  'pat_tokens.expires_at': '过期时间（epoch ms），签发后 90 天',
  'pat_tokens.revoked_at': '吊销时间（epoch ms），吊销不删行',
  'pat_tokens.revoked_by': '吊销操作人 → users.id',
  'accounts': '小红书账号（矩阵资产）',
  'accounts.name': '账号名',
  'accounts.category': '赛道（自由文本维度，如 美妆/穿搭）',
  'accounts.status': '状态枚举：warming=起号中 / active=正常接单 / sealed=已封死',
  'accounts.purchased_at': '买入日期（epoch ms）',
  'accounts.owner_id': '负责人 → users.id',
  'accounts.note': '备注',
  'customers': '客户（广告主）',
  'customers.name': '客户名',
  'customers.type': '类型枚举：brand=品牌直客 / agency=媒介 / platform=蒲公英平台',
  'customers.wechat': '微信号',
  'customers.note': '备注',
  'ad_orders': '广告订单（收入事实表）',
  'ad_orders.account_id': '接单账号 → accounts.id',
  'ad_orders.customer_id': '客户 → customers.id',
  'ad_orders.brand': '品牌名',
  'ad_orders.product': '产品名',
  'ad_orders.brief': '需求简述',
  'ad_orders.amount_cents': '订单金额（单位：分）',
  'ad_orders.channel': '渠道枚举：private=私单 / platform=蒲公英',
  'ad_orders.published_at': '业务日期：发布日期（epoch ms），收入按它归集',
  'ad_orders.updated_by': '最近修改人 → users.id（写 SQL 须手动补）',
  'account_investments': '账号投入（买入 + 投流，成本事实表）',
  'account_investments.account_id': '账号 → accounts.id',
  'account_investments.type': '类型枚举：purchase=买入 / traffic=投流',
  'account_investments.amount_cents': '金额（单位：分）',
  'account_investments.spent_at': '业务日期：支出日期（epoch ms）',
  'account_investments.note': '备注',
  'operating_expenses': '运营费用（公司级，不归属账号）',
  'operating_expenses.category': '类别枚举：salary=工资 / office=办公 / other=其他',
  'operating_expenses.amount_cents': '金额（单位：分）',
  'operating_expenses.spent_at': '业务日期：支出日期（epoch ms）',
  'operating_expenses.note': '备注',
  'audit_log': '审计日志（追加式，禁改禁删）',
  'audit_log.user_id': '操作人 → users.id',
  'audit_log.action': '动作（如 order.create / agent.sql.write）',
  'audit_log.target_type': '目标类型',
  'audit_log.target_id': '目标 ID',
  'audit_log.detail': '细节 JSON',
  'settings': '系统设置（键值）',
  'settings.key': '键（idle_threshold_days / repurchase_threshold_days / session_secret）',
  'settings.value': '值（文本）',
  '.id': '主键',
  '.created_at': '记录创建时间（epoch ms）',
  '.updated_at': '最近修改时间（epoch ms），写 SQL 须手动补',
  '.deleted_at': '软删时间（epoch ms），非空即已删除；禁止硬删',
};

function parseMigrations() {
  const tables = new Map();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const m = /CREATE TABLE `(\w+)` \(([\s\S]*?)\);/.exec(stmt);
      if (!m) continue;
      const [, table, body] = m;
      const columns = [];
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim().replace(/,$/, '');
        const cm = /^`(\w+)` (\w+)(.*?)$/.exec(line);
        if (cm) {
          const [, col, type, rest] = cm;
          const pk = /PRIMARY KEY/i.test(rest);
          const constraints = [
            pk ? (/AUTOINCREMENT/i.test(rest) ? 'PK 自增' : 'PK') : '',
            /NOT NULL/i.test(rest) ? 'NOT NULL' : '可空',
          ].filter(Boolean).join('，');
          const dm = /DEFAULT ('[^']*'|\S+)/i.exec(rest);
          columns.push({ name: col, type, constraints, def: dm ? dm[1] : null, fk: null });
          continue;
        }
        const fm = /FOREIGN KEY \(`(\w+)`\) REFERENCES `(\w+)`\(`(\w+)`\)/.exec(line);
        if (fm) {
          const col = columns.find((c) => c.name === fm[1]);
          if (col) col.fk = `${fm[2]}.${fm[3]}`;
        }
      }
      tables.set(table, columns);
    }
  }
  return [...tables.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// 从 SKILL.md 现有 schema 区块回收手写含义：{ 'table.column' | 'table' → 含义 }
function harvestMeanings(existing) {
  const meanings = {};
  let curTable = null;
  for (const line of existing.split('\n')) {
    const tm = /^### `(\w+)`/.exec(line);
    if (tm) { curTable = tm[1]; continue; }
    if (!curTable) continue;
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 5 || !/^`\w+`$/.test(cells[1] ?? '')) continue;
    const col = cells[1].slice(1, -1);
    const meaning = cells[4];
    if (meaning && meaning !== '—') meanings[`${curTable}.${col}`] = meaning;
  }
  return meanings;
}

export function renderSchemaBlock(existingBlock = '') {
  const harvested = harvestMeanings(existingBlock);
  const meaningOf = (table, col) =>
    harvested[`${table}.${col}`] ?? DEFAULT_MEANINGS[`${table}.${col}`] ?? DEFAULT_MEANINGS[`.${col}`] ?? '⚠ 待补充';
  const tableMeaningOf = (table) => harvested[table] ?? DEFAULT_MEANINGS[table] ?? '⚠ 待补充';

  const out = [];
  for (const [table, columns] of parseMigrations()) {
    out.push(`### \`${table}\` — ${tableMeaningOf(table)}`);
    out.push('');
    out.push('| 列 | 类型 | 约束 | 含义 |');
    out.push('|---|---|---|---|');
    for (const c of columns) {
      const cons = [c.constraints, c.def !== null ? `默认 ${c.def}` : '', c.fk ? `→ ${c.fk}` : ''].filter(Boolean).join('，');
      out.push(`| \`${c.name}\` | ${c.type} | ${cons || '—'} | ${meaningOf(table, c.name)} |`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}

export function extractBlock(content, begin, end) {
  const i = content.indexOf(begin);
  const j = content.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return content.slice(i + begin.length, j);
}

function main() {
  const check = process.argv.includes('--check');
  const content = readFileSync(SKILL_MD, 'utf8');
  const existing = extractBlock(content, SCHEMA_BEGIN, SCHEMA_END);
  if (existing === null) {
    console.error(`gen-skill-schema: SKILL.md 缺少 ${SCHEMA_BEGIN} / ${SCHEMA_END} 标记`);
    process.exit(1);
  }
  const generated = renderSchemaBlock(existing);
  if (generated === existing.trim()) {
    console.log('gen-skill-schema: schema 区块与 migration 一致，无漂移');
    return;
  }
  if (check) {
    console.error('gen-skill-schema: SKILL.md schema 区块与 migration 漂移！运行 node scripts/gen-skill-schema.mjs 重新生成');
    process.exit(1);
  }
  const next = content.slice(0, content.indexOf(SCHEMA_BEGIN) + SCHEMA_BEGIN.length) + '\n' + generated + '\n' + content.slice(content.indexOf(SCHEMA_END));
  writeFileSync(SKILL_MD, next);
  console.log('gen-skill-schema: 已更新 SKILL.md schema 区块');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
