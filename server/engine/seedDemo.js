// S10 演示数据生成器：拟真但虚构。全部写入一个事务；订单流水的金额下限由程序内自检保证
// （任选连续 12 个月订单总额 >1e8 分），不达标就调高规模参数重试。
const DAY_MS = 24 * 3600 * 1000;
const START_MONTH = '2023-09'; // 流水起点（PRD S10）
const ROLLING_12_MIN_CENTS = 1e8; // 100 万元
const MONTH_MIN_CENTS = 8.6e6; // 每月至少 86 万元，保证任意 12 个月窗口 >100 万

// 赛道配置：[单价区间（分，scale=1 基准）, 买入成本区间（分）, 账号昵称池]
const CATEGORIES = [
  { name: '美妆', price: [60000, 220000], cost: [200000, 600000], names: ['桃桃的梳妆台', '梨子美妆日记', '早八妆容研究所', '阿May试色间', '小鹿的化妆包', '彩妆小学生阿茶'] },
  { name: '母婴', price: [50000, 200000], cost: [150000, 500000], names: ['工科奶爸测评', '橙子妈妈手记', '小满育儿账本', '两娃妈好物箱', '围裙妈妈实验室', '遛娃装备库'] },
  { name: '家居', price: [40000, 180000], cost: [120000, 400000], names: ['一居室改造日记', '收纳控阿岛', '原木风小家', '租屋改造阿凯', '阳台植物园丁', '小家越住越大'] },
  { name: '数码', price: [80000, 250000], cost: [250000, 800000], names: ['拆机老周', '参数党小雷', '桌面搭建日志', '数码尝鲜派', '外设收藏夹', '评测晚自习'] },
  { name: '美食', price: [30000, 120000], cost: [80000, 300000], names: ['深夜小灶', '阿宽的食堂', '减脂餐日记', '街边小吃地图', '烘焙翻车现场', '一人食研究所'] },
  { name: '穿搭', price: [40000, 160000], cost: [100000, 350000], names: ['胶囊衣橱实践', '小个子穿搭笔记', '通勤衣橱', '阿黎的试衣间', '旧衣新穿研究所', '色彩穿搭手账'] },
  { name: '宠物', price: [30000, 140000], cost: [90000, 320000], names: ['橘座日常', '柴犬豆豆', '猫奴小王', '三猫一狗之家', '毛孩子账本', '爬宠小屋'] },
  { name: '职场', price: [35000, 150000], cost: [100000, 280000], names: ['简历诊所', '大厂离职日记', 'Excel表姐', '职场沟通笔记', '副业实验田', '面试通关手册'] },
];

const AGENCY_NAMES = ['星河传媒', '云帆互动', '青藤文化', '橘光营销', '拾光传媒', '白鹭互动', '山海文化', '逐浪传媒', '麦芽互动', '木棉文化', '千帆营销', '鹿鸣传媒', '初禾文化', '微澜互动', '谷雨传媒'];
const BRAND_NAMES = ['栖迟', '沫白', '禾润', '拾柒', '岚汀', '植本堂', '初笙', '澄光', '觅屿', '沐岚', '栖谷', '柚见', '森町', '露华集', '半亩田', '澄溪', '植语', '暖屿', '青禾集', '沐初', '栖野', '云木', '浅山', '禾风', '栀夏'];
const PRODUCT_WORDS = ['精华', '面霜', '礼盒', '套装', '新品', '限定款', '经典款'];
const BRIEFS = ['图文一篇', '视频种草', '合集植入', '测评笔记', '直播切片', '好物分享'];

function rand(min, max) { // [min, max] 整数
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function monthList(now) {
  const [sy, sm] = START_MONTH.split('-').map(Number);
  const end = new Date(now);
  const out = [];
  let y = sy;
  let m = sm;
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 1)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { y += 1; m = 1; }
  }
  return out;
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
}

export function hasBusinessData(db) {
  for (const table of ['accounts', 'customers', 'ad_orders', 'account_investments', 'operating_expenses']) {
    if (db.prepare(`SELECT EXISTS(SELECT 1 FROM ${table}) AS x`).get().x) return true;
  }
  return false;
}

export function wipeBusinessData(db) {
  const wipe = db.transaction(() => {
    for (const table of ['ad_orders', 'account_investments', 'operating_expenses', 'accounts', 'customers']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
  wipe();
}

// 生成 + 自检 + 必要时调参重试。scale 放大订单量与单价上限。
export function seedDemo(db, { userId, now = Date.now() }) {
  let scale = 1;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const data = buildData(now, scale);
    if (checkRolling12(data.orders)) return writeAll(db, data, userId);
    scale += 0.5;
  }
  throw new Error('seedDemo: 自检未通过（连续 12 个月订单总额不足 100 万元），已放弃写入');
}

function buildData(now, scale) {
  const months = monthList(now);

  // 账号：45 个，8 赛道轮流分配；买入日期 3 年前~6 个月前
  const accounts = [];
  const usedNames = new Set();
  for (let i = 0; i < 45; i += 1) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    let name = pick(cat.names);
    if (usedNames.has(name)) name = `${name}${Math.floor(i / CATEGORIES.length) + 1}号`;
    usedNames.add(name);
    const purchasedAt = now - rand(180, 365 * 3) * DAY_MS;
    const roll = Math.random();
    const status = roll < 0.72 ? 'active' : roll < 0.88 ? 'warming' : 'sealed';
    accounts.push({
      name,
      category: cat.name,
      status,
      purchasedAt,
      purchaseCents: rand(Math.round(cat.cost[0] / 100), Math.round(cat.cost[1] / 100)) * 100,
      purchasedMonth: new Date(purchasedAt).toISOString().slice(0, 7),
    });
  }

  // 客户：15 媒介 + 25 品牌 + 1 平台
  const customers = [
    ...AGENCY_NAMES.map((name) => ({ name, type: 'agency' })),
    ...BRAND_NAMES.map((name) => ({ name, type: 'brand' })),
    { name: '蒲公英平台', type: 'platform' },
  ];
  const brands = customers.filter((c) => c.type === 'brand');
  const agencies = customers.filter((c) => c.type === 'agency');
  const platform = customers.find((c) => c.type === 'platform');

  // 订单：每月先随机 15~30 单；当月总额不足 MONTH_MIN_CENTS 就继续补单（自检兜底见 checkRolling12）
  const orders = [];
  const activePool = accounts.filter((a) => a.status !== 'sealed');
  for (const month of months) {
    const [from, to] = monthBounds(month);
    const upper = Math.min(to, now);
    if (from >= upper) continue;
    let monthTotal = 0;
    let remaining = rand(15, 30);
    // 每月保底 15~30 单，且月总额不低于 MONTH_MIN_CENTS（不足则继续补单，rolling-12 自检兜底）
    while (remaining > 0 || monthTotal < MONTH_MIN_CENTS * scale) {
      const account = pick(activePool);
      const cat = CATEGORIES.find((c) => c.name === account.category);
      const isPlatform = Math.random() < 0.35;
      const customer = isPlatform ? platform : Math.random() < 0.55 ? pick(brands) : pick(agencies);
      const priceCap = Math.round(cat.price[1] * scale / 100) * 100;
      const amountCents = rand(Math.round(cat.price[0] / 100), Math.round(priceCap / 100)) * 100;
      const publishedAt = rand(Math.floor(from / DAY_MS), Math.floor((upper - 1) / DAY_MS)) * DAY_MS + rand(0, 86399) * 1000;
      const isBrand = customer.type === 'brand';
      orders.push({
        account, customer,
        brand: isBrand ? customer.name : pick(BRAND_NAMES),
        product: isBrand ? pick(PRODUCT_WORDS) : null,
        brief: pick(BRIEFS),
        amountCents,
        channel: isPlatform ? 'platform' : 'private',
        publishedAt,
      });
      monthTotal += amountCents;
      remaining -= 1;
    }
  }

  // 投入：每账号一条买入 + 起号期 3~8 个月投流
  const investments = [];
  for (const account of accounts) {
    investments.push({ account, type: 'purchase', amountCents: account.purchaseCents, spentAt: account.purchasedAt, note: '账号买入' });
    const trafficMonths = account.status === 'sealed' ? rand(2, 4) : rand(3, 8);
    for (let i = 0; i < trafficMonths; i += 1) {
      const spentAt = account.purchasedAt + rand(i * 28, i * 28 + 27) * DAY_MS;
      if (spentAt >= now) continue;
      investments.push({ account, type: 'traffic', amountCents: rand(300, 3000) * 100, spentAt, note: pick(['薯条推广', '聚光投放', '笔记加热']) });
    }
  }

  // 运营费用：每月 1~2 份工资 + 一笔办公
  const expenses = [];
  for (const month of months) {
    const [from, to] = monthBounds(month);
    const upper = Math.min(to, now);
    if (from >= upper) continue;
    for (let p = 0; p < rand(1, 2); p += 1) {
      expenses.push({ category: 'salary', amountCents: rand(6000, 9000) * 100, spentAt: from + rand(0, 4) * DAY_MS, note: '员工工资' });
    }
    expenses.push({ category: 'office', amountCents: rand(800, 2000) * 100, spentAt: from + rand(5, 20) * DAY_MS, note: pick(['房租物业', '水电网', '办公用品']) });
  }

  return { months, accounts, customers, orders, investments, expenses };
}

function checkRolling12(orders) {
  const byMonth = new Map();
  for (const o of orders) {
    const m = new Date(o.publishedAt).toISOString().slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + o.amountCents);
  }
  const totals = [...byMonth.keys()].sort().map((m) => byMonth.get(m));
  if (totals.length < 36) return false;
  for (let i = 0; i + 12 <= totals.length; i += 1) {
    if (totals.slice(i, i + 12).reduce((s, v) => s + v, 0) <= ROLLING_12_MIN_CENTS) return false;
  }
  return true;
}

function writeAll(db, data, userId) {
  const now = Date.now();
  const insAccount = db.prepare('INSERT INTO accounts (name, category, status, purchased_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insCustomer = db.prepare('INSERT INTO customers (name, type, created_at, updated_at) VALUES (?, ?, ?, ?)');
  const insOrder = db.prepare('INSERT INTO ad_orders (account_id, customer_id, brand, product, brief, amount_cents, channel, published_at, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insInvestment = db.prepare('INSERT INTO account_investments (account_id, type, amount_cents, spent_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insExpense = db.prepare('INSERT INTO operating_expenses (category, amount_cents, spent_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');

  let totalRevenueCents = 0;
  const run = db.transaction(() => {
    const accountIds = new Map();
    for (const a of data.accounts) {
      const id = Number(insAccount.run(a.name, a.category, a.status, a.purchasedAt, now, now).lastInsertRowid);
      accountIds.set(a, id);
    }
    const customerIds = new Map();
    for (const c of data.customers) {
      customerIds.set(c, Number(insCustomer.run(c.name, c.type, now, now).lastInsertRowid));
    }
    for (const o of data.orders) {
      insOrder.run(accountIds.get(o.account), customerIds.get(o.customer), o.brand, o.product, o.brief, o.amountCents, o.channel, o.publishedAt, o.publishedAt, now, userId);
      totalRevenueCents += o.amountCents;
    }
    for (const i of data.investments) {
      insInvestment.run(accountIds.get(i.account), i.type, i.amountCents, i.spentAt, i.note, now, now);
    }
    for (const e of data.expenses) {
      insExpense.run(e.category, e.amountCents, e.spentAt, e.note, now, now);
    }
  });
  run();

  return {
    accounts: data.accounts.length,
    customers: data.customers.length,
    orders: data.orders.length,
    investments: data.investments.length,
    expenses: data.expenses.length,
    months: data.months.length,
    fromMonth: data.months[0],
    toMonth: data.months[data.months.length - 1],
    totalRevenueCents,
  };
}
