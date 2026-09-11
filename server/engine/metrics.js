// 指标定义层：口径唯一真相源。页面 /api/metrics/* 与 /api/v1/agent/metrics[/query] 都从这里取数。
// 每个指标一张定义卡：稳定英文名 / 中文名 / 业务定义 / 参数化 SQL（唯一实现）/ 可切维度 / 时间口径。
import { httpError } from './errors.js';

const DAY_MS = 24 * 3600 * 1000;

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!m) throw httpError(400, 'bad_request', 'month 格式应为 YYYY-MM');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw httpError(400, 'bad_request', 'month 格式应为 YYYY-MM');
  return [Date.UTC(y, mo - 1, 1), Date.UTC(y, mo, 1)];
}

function defaultMonth(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function optPositiveInt(v, label) {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v) || v <= 0) throw httpError(400, 'bad_request', `${label}必须为正整数`);
  return v;
}

function optIdParam(v, label) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'bad_request', `${label}非法`);
  return n;
}

function settingInt(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// 各指标的参数化 SQL 实现（唯一一份）。过滤参数走绑定变量，维度参数是枚举校验后的白名单值。
const METRICS = {
  monthly_overview: {
    name: 'monthly_overview',
    nameZh: '月度总览',
    definition: '当月收入=广告订单按发布日期求和；投流=当月投流记录合计；运营费用=当月运营费用合计；净结余=收入−投流−运营费用。不含买入成本。',
    dimensions: ['month', 'category'],
    timeField: 'published_at / spent_at（业务日期）',
    run(db, { month, category, now } = {}) {
      const [from, to] = monthRange(month ?? defaultMonth(now ?? Date.now()));
      const catConds = category ? ' AND a.category = ?' : '';
      const catParams = category ? [category] : [];
      const revenue = db.prepare(
        `SELECT COALESCE(SUM(o.amount_cents), 0) AS v FROM ad_orders o JOIN accounts a ON a.id = o.account_id
         WHERE o.deleted_at IS NULL AND o.published_at >= ? AND o.published_at < ?${catConds}`,
      ).get(from, to, ...catParams).v;
      const traffic = db.prepare(
        `SELECT COALESCE(SUM(i.amount_cents), 0) AS v FROM account_investments i JOIN accounts a ON a.id = i.account_id
         WHERE i.deleted_at IS NULL AND i.type = 'traffic' AND i.spent_at >= ? AND i.spent_at < ?${catConds}`,
      ).get(from, to, ...catParams).v;
      // 运营费用是公司级独立账，不归属账号，赛道筛选时仍返回全公司费用（口径透明）
      const expense = db.prepare(
        'SELECT COALESCE(SUM(amount_cents), 0) AS v FROM operating_expenses WHERE deleted_at IS NULL AND spent_at >= ? AND spent_at < ?',
      ).get(from, to).v;
      return { month: month ?? defaultMonth(now ?? Date.now()), revenueCents: revenue, trafficCents: traffic, expenseCents: expense, netCents: revenue - traffic - expense };
    },
  },

  account_pnl: {
    name: 'account_pnl',
    nameZh: '账号盈亏排行',
    definition: '单账号净盈亏 = 累计广告收入 −（买入成本 + 累计投流）；>0 为已回本；不含运营费用（不摊到账号）。按净盈亏降序。',
    dimensions: ['category', 'ownerId', 'status'],
    timeField: '累计（不受时间范围限制）',
    run(db, { category, ownerId, status } = {}) {
      const conds = ['a.deleted_at IS NULL'];
      const params = [];
      if (category) { conds.push('a.category = ?'); params.push(category); }
      if (ownerId != null) { conds.push('a.owner_id = ?'); params.push(optIdParam(ownerId, 'ownerId')); }
      if (status) { conds.push('a.status = ?'); params.push(status); }
      const rows = db.prepare(
        `SELECT a.id, a.name, a.category, a.status, a.owner_id AS ownerId,
                COALESCE(inv.purchase, 0) AS purchaseCents,
                COALESCE(inv.traffic, 0) AS trafficCents,
                COALESCE(inv.purchase, 0) + COALESCE(inv.traffic, 0) AS totalInvestedCents,
                COALESCE(rev.total, 0) AS revenueCents,
                COALESCE(rev.total, 0) - COALESCE(inv.purchase, 0) - COALESCE(inv.traffic, 0) AS netCents
         FROM accounts a
         LEFT JOIN (
           SELECT account_id,
                  SUM(CASE WHEN type = 'purchase' THEN amount_cents END) AS purchase,
                  SUM(CASE WHEN type = 'traffic' THEN amount_cents END) AS traffic
           FROM account_investments WHERE deleted_at IS NULL GROUP BY account_id
         ) inv ON inv.account_id = a.id
         LEFT JOIN (
           SELECT account_id, SUM(amount_cents) AS total
           FROM ad_orders WHERE deleted_at IS NULL GROUP BY account_id
         ) rev ON rev.account_id = a.id
         WHERE ${conds.join(' AND ')}
         ORDER BY netCents DESC`,
      ).all(...params);
      return { rows };
    },
  },

  idle_accounts: {
    name: 'idle_accounts',
    nameZh: '闲置账号预警',
    definition: '距最近一单发布超过阈值（默认 30 天，存 settings.idle_threshold_days 可调）且状态非「已封死」的账号；从未接单的账号按无限闲置计。',
    dimensions: ['category', 'ownerId'],
    timeField: 'published_at（最近发布日期）',
    run(db, { thresholdDays, category, ownerId, now } = {}) {
      const threshold = optPositiveInt(thresholdDays, 'thresholdDays') ?? settingInt(db, 'idle_threshold_days', 30);
      const ref = now ?? Date.now();
      const cutoff = ref - threshold * DAY_MS;
      const conds = ["a.deleted_at IS NULL", "a.status != 'sealed'"];
      const params = [];
      if (category) { conds.push('a.category = ?'); params.push(category); }
      if (ownerId != null) { conds.push('a.owner_id = ?'); params.push(optIdParam(ownerId, 'ownerId')); }
      const rows = db.prepare(
        `SELECT a.id, a.name, a.category, a.status, a.owner_id AS ownerId, MAX(o.published_at) AS lastOrderAt
         FROM accounts a LEFT JOIN ad_orders o ON o.account_id = a.id AND o.deleted_at IS NULL
         WHERE ${conds.join(' AND ')}
         GROUP BY a.id
         HAVING lastOrderAt IS NULL OR lastOrderAt < ?
         ORDER BY lastOrderAt ASC`,
      ).all(...params, cutoff);
      return {
        thresholdDays: threshold,
        rows: rows.map((r) => ({
          ...r,
          daysSinceLastOrder: r.lastOrderAt == null ? null : Math.floor((ref - r.lastOrderAt) / DAY_MS),
        })),
      };
    },
  },

  customer_contribution: {
    name: 'customer_contribution',
    nameZh: '客户贡献排行',
    definition: '客户全部广告订单金额合计降序；可按客户类型（品牌直客/媒介/平台）与月份筛选。',
    dimensions: ['type', 'month'],
    timeField: 'published_at（发布日期）',
    run(db, { type, month } = {}) {
      const conds = ['o.deleted_at IS NULL', 'c.deleted_at IS NULL'];
      const params = [];
      if (type) { conds.push('c.type = ?'); params.push(type); }
      if (month) {
        const [from, to] = monthRange(month);
        conds.push('o.published_at >= ? AND o.published_at < ?');
        params.push(from, to);
      }
      const rows = db.prepare(
        `SELECT c.id, c.name, c.type,
                SUM(o.amount_cents) AS totalCents, COUNT(o.id) AS orderCount, MAX(o.published_at) AS lastOrderAt
         FROM ad_orders o JOIN customers c ON c.id = o.customer_id
         WHERE ${conds.join(' AND ')}
         GROUP BY c.id ORDER BY totalCents DESC`,
      ).all(...params);
      return { rows };
    },
  },

  category_revenue: {
    name: 'category_revenue',
    nameZh: '赛道收入对比',
    definition: '按账号所属赛道汇总订单金额，按月分组（月度趋势 + 累计由调用方按月加总）。',
    dimensions: ['category', 'month'],
    timeField: 'published_at（发布日期）',
    run(db, { fromMonth, toMonth, category } = {}) {
      const conds = ['o.deleted_at IS NULL'];
      const params = [];
      if (fromMonth) { conds.push('o.published_at >= ?'); params.push(monthRange(fromMonth)[0]); }
      if (toMonth) { conds.push('o.published_at < ?'); params.push(monthRange(toMonth)[1]); }
      if (category) { conds.push('a.category = ?'); params.push(category); }
      const rows = db.prepare(
        `SELECT a.category, strftime('%Y-%m', o.published_at / 1000, 'unixepoch') AS month,
                SUM(o.amount_cents) AS revenueCents, COUNT(o.id) AS orderCount
         FROM ad_orders o JOIN accounts a ON a.id = o.account_id
         WHERE ${conds.join(' AND ')}
         GROUP BY a.category, month ORDER BY month, a.category`,
      ).all(...params);
      return { rows };
    },
  },

  repurchase_reminders: {
    name: 'repurchase_reminders',
    nameZh: '复购提醒',
    definition: '距上次合作（最近一单发布日期）超过阈值（默认 30 天，存 settings.repurchase_threshold_days 可调）的客户清单。',
    dimensions: ['type'],
    timeField: 'published_at（最近发布日期）',
    run(db, { thresholdDays, type, now } = {}) {
      const threshold = optPositiveInt(thresholdDays, 'thresholdDays') ?? settingInt(db, 'repurchase_threshold_days', 30);
      const ref = now ?? Date.now();
      const cutoff = ref - threshold * DAY_MS;
      const conds = ['c.deleted_at IS NULL'];
      const params = [];
      if (type) { conds.push('c.type = ?'); params.push(type); }
      const rows = db.prepare(
        `SELECT c.id, c.name, c.type, MAX(o.published_at) AS lastOrderAt, SUM(o.amount_cents) AS totalCents
         FROM customers c JOIN ad_orders o ON o.customer_id = c.id AND o.deleted_at IS NULL
         WHERE ${conds.join(' AND ')}
         GROUP BY c.id
         HAVING lastOrderAt < ?
         ORDER BY lastOrderAt ASC`,
      ).all(...params, cutoff);
      return {
        thresholdDays: threshold,
        rows: rows.map((r) => ({ ...r, daysSinceLastOrder: Math.floor((ref - r.lastOrderAt) / DAY_MS) })),
      };
    },
  },

  account_valuation: {
    name: 'account_valuation',
    nameZh: '账号估值参考',
    definition: '估值 = 近 N 个自然月（UTC）平均月收入 × 倍数（默认 6 个月 × 6，参数可调）；返回计算依据。仅为参考，不构成定价。',
    dimensions: ['accountId'],
    timeField: 'published_at（发布日期，按 UTC 自然月）',
    run(db, { accountId, months, multiplier, now } = {}) {
      const m = optPositiveInt(months, 'months') ?? 6;
      const mul = optPositiveInt(multiplier, 'multiplier') ?? 6;
      const ref = now ?? Date.now();
      const d = new Date(ref);
      const windowEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      const windowStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 - m, 1);
      const conds = ['a.deleted_at IS NULL'];
      const params = [windowStart, windowEnd];
      if (accountId != null) { conds.push('a.id = ?'); params.push(optIdParam(accountId, 'accountId')); }
      const rows = db.prepare(
        `SELECT a.id AS accountId, a.name, a.category,
                COALESCE((SELECT SUM(o.amount_cents) FROM ad_orders o
                          WHERE o.account_id = a.id AND o.deleted_at IS NULL
                            AND o.published_at >= ? AND o.published_at < ?), 0) AS totalRevenueCents
         FROM accounts a WHERE ${conds.join(' AND ')} ORDER BY totalRevenueCents DESC`,
      ).all(...params);
      return {
        rows: rows.map((r) => {
          const monthlyAvgCents = Math.round(r.totalRevenueCents / m);
          return {
            ...r,
            valuationCents: monthlyAvgCents * mul,
            basis: { months: m, multiplier: mul, windowStart, windowEnd, totalRevenueCents: r.totalRevenueCents, monthlyAvgCents },
          };
        }),
      };
    },
  },
};

export function listMetricCards() {
  return Object.values(METRICS).map(({ run: _run, ...card }) => card);
}

export function queryMetric(db, name, params = {}) {
  const metric = METRICS[name];
  if (!metric) throw httpError(400, 'bad_request', `未知指标：${name}（可用：${Object.keys(METRICS).join(', ')}）`);
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw httpError(400, 'bad_request', 'params 必须是对象');
  }
  return { metric: name, result: metric.run(db, params) };
}
