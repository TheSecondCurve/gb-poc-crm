// 经营看板（S4/S6）：五个指标卡/榜单 + 复购提醒；时间范围切换、赛道/负责人筛选下钻；
// 取数唯一入口 /api/metrics/*，口径 hover 可见；图表 recharts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtCents, currentMonthUTC, addMonths } from '../format';
import { Amount, Badge, Btn, Card, EmptyState, Select, Spinner } from '../components/ui';
import type {
  AccountPnlRow, CategoryRevenueRow, CustomerContributionRow,
  IdleAccountRow, MetricCard, MonthlyOverview, RepurchaseReminderRow,
} from '../types';

type RangeKey = 'this' | 'last3' | 'last12' | 'custom';

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export function DashboardPage() {
  const { t, toast, refreshBoot } = useStore();
  const nowMonth = currentMonthUTC();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this');
  const [customFrom, setCustomFrom] = useState(addMonths(nowMonth, -2));
  const [customTo, setCustomTo] = useState(nowMonth);
  const [category, setCategory] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<MetricCard[]>([]);
  const [overview, setOverview] = useState<MonthlyOverview[]>([]);
  const [pnl, setPnl] = useState<AccountPnlRow[]>([]);
  const [idle, setIdle] = useState<IdleAccountRow[]>([]);
  const [contribution, setContribution] = useState<CustomerContributionRow[]>([]);
  const [catRevenue, setCatRevenue] = useState<CategoryRevenueRow[]>([]);
  const [reminders, setReminders] = useState<RepurchaseReminderRow[]>([]);
  const [hasData, setHasData] = useState(true);
  const [sampleLoading, setSampleLoading] = useState(false);

  const [fromMonth, toMonth] = useMemo<[string, string]>(() => {
    if (rangeKey === 'this') return [nowMonth, nowMonth];
    if (rangeKey === 'last3') return [addMonths(nowMonth, -2), nowMonth];
    if (rangeKey === 'last12') return [addMonths(nowMonth, -11), nowMonth];
    return [customFrom <= customTo ? customFrom : customTo, customFrom <= customTo ? customTo : customFrom];
  }, [rangeKey, customFrom, customTo, nowMonth]);

  const defOf = useCallback((name: string) => catalog.find((m) => m.name === name), [catalog]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const months = monthsBetween(fromMonth, toMonth);
      const [cat, overviews, pnlRes, idleRes, contribRes, catRevRes, remindRes] = await Promise.all([
        api.metricsCatalog(),
        Promise.all(months.map((m) => api.queryMetric<MonthlyOverview>('monthly_overview', { month: m, ...(category ? { category } : {}) }))),
        api.queryMetric<{ rows: AccountPnlRow[] }>('account_pnl', { ...(category ? { category } : {}), ...(ownerId ? { ownerId: Number(ownerId) } : {}) }),
        api.queryMetric<{ rows: IdleAccountRow[] }>('idle_accounts', { ...(category ? { category } : {}), ...(ownerId ? { ownerId: Number(ownerId) } : {}) }),
        api.queryMetric<{ rows: CustomerContributionRow[] }>('customer_contribution', { ...(customerType ? { type: customerType } : {}) }),
        api.queryMetric<{ rows: CategoryRevenueRow[] }>('category_revenue', { fromMonth, toMonth }),
        api.queryMetric<{ rows: RepurchaseReminderRow[] }>('repurchase_reminders', {}),
      ]);
      setCatalog(cat.metrics);
      setOverview(overviews.map((r) => r.result));
      setPnl(pnlRes.result.rows);
      setIdle(idleRes.result.rows);
      setContribution(contribRes.result.rows);
      setCatRevenue(catRevRes.result.rows);
      setReminders(remindRes.result.rows);
      setHasData(pnlRes.result.rows.length > 0 || overviews.some((r) => r.result.revenueCents > 0));
    } catch {
      toast(t('failed'), 'err');
    } finally {
      setLoading(false);
    }
  }, [fromMonth, toMonth, category, ownerId, customerType, toast, t]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => overview.reduce(
    (acc, m) => ({
      revenueCents: acc.revenueCents + m.revenueCents,
      trafficCents: acc.trafficCents + m.trafficCents,
      expenseCents: acc.expenseCents + m.expenseCents,
      netCents: acc.netCents + m.netCents,
    }),
    { revenueCents: 0, trafficCents: 0, expenseCents: 0, netCents: 0 },
  ), [overview]);

  const categories = useMemo(() => [...new Set(pnl.map((r) => r.category))], [pnl]);

  const loadSample = async () => {
    setSampleLoading(true);
    try {
      const a1 = await api.createAccount({ name: '示例·美妆一号', category: '美妆', purchasedAt: Date.UTC(2026, 0, 5), purchaseCostCents: 150000 });
      const a2 = await api.createAccount({ name: '示例·穿搭小号', category: '穿搭', purchasedAt: Date.UTC(2025, 9, 1), purchaseCostCents: 50000 });
      await api.createInvestment({ accountId: a1.id, type: 'traffic', amountCents: 30000, spentAt: Date.UTC(2026, 2, 3), note: '点赞' });
      const c1 = await api.createCustomer({ name: '示例客户·欧莱雅', type: 'brand' });
      await api.createOrder({ accountId: a1.id, customerId: c1.id, brand: '兰蔻', product: '小黑瓶', brief: '图文一篇', amountCents: 120000, channel: 'private', publishedAt: Date.UTC(2026, 2, 15) });
      await api.createOrder({ accountId: a2.id, customerId: c1.id, brand: 'UR', amountCents: 60000, channel: 'platform', publishedAt: Date.UTC(2025, 11, 10) });
      await api.createExpense({ category: 'salary', amountCents: 500000, spentAt: Date.UTC(2026, 2, 1), note: '示例工资' });
      toast(t('sampleLoaded'));
      await refreshBoot();
      await load();
    } catch {
      toast(t('failed'), 'err');
    } finally {
      setSampleLoading(false);
    }
  };

  const defIcon = (name: string) => (
    <span title={`${t('metricDefinition')}：${defOf(name)?.definition ?? ''}`} className="inline-flex cursor-help text-ink-400">
      <Info size={13} />
    </span>
  );

  if (loading && overview.length === 0) return <Spinner />;

  if (!hasData && !loading) {
    return (
      <EmptyState title={t('emptyDashboardTitle')} desc={t('emptyDashboardDesc')}>
        <Btn variant="primary" onClick={() => void loadSample()} loading={sampleLoading}>{t('loadSample')}</Btn>
        <Btn onClick={() => navigate('accounts')}>{t('startFromScratch')}</Btn>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选条：时间范围 + 赛道 + 负责人 */}
      <div className="flex flex-wrap items-center gap-2">
        {(['this', 'last3', 'last12', 'custom'] as RangeKey[]).map((k) => (
          <Btn key={k} variant={rangeKey === k ? 'primary' : 'ghost'} onClick={() => setRangeKey(k)}>
            {k === 'this' ? t('thisMonth') : k === 'last3' ? t('last3Months') : k === 'last12' ? t('last12Months') : t('customRange')}
          </Btn>
        ))}
        {rangeKey === 'custom' && (
          <>
            <input type="month" aria-label={t('from')} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-md border border-black/10 px-2 py-1 text-sm" />
            <span className="text-xs text-ink-400">→</span>
            <input type="month" aria-label={t('to')} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-md border border-black/10 px-2 py-1 text-sm" />
          </>
        )}
        <Select aria-label={t('categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
      </div>

      {/* 月度总览 */}
      <Card title={<span className="flex items-center gap-1.5">{t('monthlyOverview')}（{fromMonth}{fromMonth !== toMonth ? ` ~ ${toMonth}` : ''}）{defIcon('monthly_overview')}</span>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            [t('revenue'), totals.revenueCents],
            [t('trafficCost'), totals.trafficCents],
            [t('expenseTotal'), totals.expenseCents],
            [t('netBalance'), totals.netCents],
          ] as [string, number][]).map(([label, cents]) => (
            <div key={label} className="rounded-md bg-paper p-3">
              <div className="text-xs text-ink-400">{label}</div>
              <Amount cents={cents} signed={label === t('netBalance')} className="text-lg font-semibold" />
            </div>
          ))}
        </div>
        {overview.length > 1 && (
          <div className="mt-3 h-52">
            <ResponsiveContainer>
              <BarChart data={overview.map((m) => ({ month: m.month, [t('revenue')]: m.revenueCents / 100, [t('trafficCost')]: m.trafficCents / 100, [t('expenseTotal')]: m.expenseCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t('revenue')} fill="#2b7fff" />
                <Bar dataKey={t('trafficCost')} fill="#f5a524" />
                <Bar dataKey={t('expenseTotal')} fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 账号盈亏排行 */}
        <Card title={<span className="flex items-center gap-1.5">{t('accountPnl')} {defIcon('account_pnl')}</span>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="py-1">{t('account')}</th>
                <th className="py-1">{t('categoryLabel')}</th>
                <th className="py-1 text-right">{t('totalInvested')}</th>
                <th className="py-1 text-right">{t('totalRevenue')}</th>
                <th className="py-1 text-right">{t('netPnl')}</th>
              </tr>
            </thead>
            <tbody>
              {pnl.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-black/5 hover:bg-black/[0.02]" onClick={() => navigate(`accounts/${r.id}`)}>
                  <td className="py-1.5">
                    {r.name}
                    {r.status === 'sealed' && <Badge tone="red">{t('statusSealed')}</Badge>}
                  </td>
                  <td className="py-1.5 text-ink-600">{r.category}</td>
                  <td className="py-1.5 text-right"><Amount cents={r.totalInvestedCents} /></td>
                  <td className="py-1.5 text-right"><Amount cents={r.revenueCents} /></td>
                  <td className="py-1.5 text-right font-medium"><Amount cents={r.netCents} signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* 赛道收入对比 */}
        <Card title={<span className="flex items-center gap-1.5">{t('categoryRevenue')} {defIcon('category_revenue')}</span>}>
          <CategoryChart rows={catRevenue} />
        </Card>

        {/* 闲置账号预警 */}
        <Card title={<span className="flex items-center gap-1.5">{t('idleAccounts')} {defIcon('idle_accounts')}</span>}>
          {idle.length === 0 ? <p className="text-sm text-ink-400">—</p> : (
            <ul className="flex flex-col gap-1.5">
              {idle.map((r) => (
                <li key={r.id} className="flex cursor-pointer items-center justify-between rounded-md bg-paper px-3 py-2 text-sm hover:bg-black/5" onClick={() => navigate(`accounts/${r.id}`)}>
                  <span>{r.name} <span className="text-xs text-ink-400">{r.category}</span></span>
                  <span className="num text-xs text-amber-600">
                    {r.daysSinceLastOrder == null ? t('neverOrdered') : t('daysUnit', { n: r.daysSinceLastOrder })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 客户贡献排行 + 复购提醒 */}
        <Card
          title={<span className="flex items-center gap-1.5">{t('customerContribution')} {defIcon('customer_contribution')}</span>}
          extra={
            <Select aria-label={t('customerType')} value={customerType} onChange={(e) => setCustomerType(e.target.value)} className="w-auto py-1 text-xs">
              <option value="">{t('allTypes')}</option>
              <option value="brand">{t('typeBrand')}</option>
              <option value="agency">{t('typeAgency')}</option>
              <option value="platform">{t('typePlatform')}</option>
            </Select>
          }
        >
          <table className="w-full text-sm">
            <tbody>
              {contribution.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-black/5 first:border-0 hover:bg-black/[0.02]" onClick={() => navigate(`customers/${r.id}`)}>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-xs text-ink-400">
                    {r.type === 'brand' ? t('typeBrand') : r.type === 'agency' ? t('typeAgency') : t('typePlatform')}
                  </td>
                  <td className="py-1.5 text-right"><Amount cents={r.totalCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {reminders.length > 0 && (
            <div className="mt-3 border-t border-black/5 pt-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-600">{t('repurchaseReminders')} {defIcon('repurchase_reminders')}</div>
              <ul className="flex flex-col gap-1">
                {reminders.map((r) => (
                  <li key={r.id} className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm hover:bg-black/5" onClick={() => navigate(`customers/${r.id}`)}>
                    <span>{r.name}</span>
                    <span className="num text-xs text-amber-600">{t('daysUnit', { n: r.daysSinceLastOrder })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, boot } = useStore();
  return (
    <Select aria-label={t('ownerLabel')} value={value} onChange={(e) => onChange(e.target.value)} className="w-auto">
      <option value="">{t('allOwners')}</option>
      {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
    </Select>
  );
}

function CategoryChart({ rows }: { rows: CategoryRevenueRow[] }) {
  const { t } = useStore();
  const data = useMemo(() => {
    const months = [...new Set(rows.map((r) => r.month))].sort();
    const cats = [...new Set(rows.map((r) => r.category))];
    return {
      cats,
      rows: months.map((m) => {
        const row: Record<string, number | string> = { month: m };
        for (const c of cats) {
          row[c] = (rows.find((r) => r.month === m && r.category === c)?.revenueCents ?? 0) / 100;
        }
        return row;
      }),
    };
  }, [rows]);
  const COLORS = ['#2b7fff', '#f5a524', '#12a150', '#8e51ff', '#e5484d', '#94a3b8'];
  if (data.rows.length === 0) return <p className="text-sm text-ink-400">—</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data.rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip formatter={(v) => `¥${fmtCents(Number(v) * 100)}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.cats.map((c, i) => <Bar key={c} dataKey={c} stackId="a" fill={COLORS[i % COLORS.length]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
