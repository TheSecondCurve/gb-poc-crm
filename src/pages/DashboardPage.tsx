// 经营看板（S4/S6）：版式照搬 gb-pmo —— 刊头 + 大数字指标版 + 编号章节表格；
// 时间范围切换、赛道/负责人筛选下钻；取数唯一入口 /api/metrics/*，口径 hover 可见；图表 recharts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtCents, currentMonthUTC, addMonths } from '../format';
import { Amount, Badge, Btn, EmptyState, Select, Spinner } from '../components/ui';
import { PageMasthead, SectionHeading } from '../components/editorial';
import type {
  AccountPnlRow, CategoryRevenueRow, CustomerContributionRow,
  IdleAccountRow, MetricCard, MonthlyOverview, RepurchaseReminderRow,
} from '../types';

type RangeKey = 'this' | 'last3' | 'last12' | 'custom';

// 编辑部图表配色（与设计令牌同源）
const CHART = {
  grid: '#dcded6',
  tick: '#6c7068',
  series: ['#344fc4', '#9a641e', '#989b93', '#327158', '#a8483c', '#344fc4'],
};

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
  const { t, toast, user, refreshBoot } = useStore();
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
    <span title={`${t('metricDefinition')}：${defOf(name)?.definition ?? ''}`} className="inline-flex cursor-help text-[var(--color-ink-faint)]">
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
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        testId="dashboard-masthead"
        kicker={t('dashKicker')}
        title={<>{t('navDashboard')} · <span className="num text-[18px] font-normal tracking-normal text-[var(--color-ink-faint)] md:text-[20px]">{fromMonth === toMonth ? fromMonth : `${fromMonth} ~ ${toMonth}`}</span></>}
        description={<>{user?.displayName}，{t('dashDesc')}</>}
        aside={(
          <div className="max-w-[240px] md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">{t('dashNotesKicker')}</div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--color-ink-soft)]">{t('dashNotes')}</div>
          </div>
        )}
      />

      {/* 筛选条：时间范围 + 赛道 + 负责人 */}
      <div data-testid="dashboard-toolbar" className="editorial-enter-late flex flex-wrap items-center gap-2 border-y border-[var(--color-line)] py-4">
        {(['this', 'last3', 'last12', 'custom'] as RangeKey[]).map((k) => (
          <button
            key={k} type="button"
            onClick={() => setRangeKey(k)}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition-[color,background-color,border-color] duration-150 ${
              rangeKey === k
                ? 'border-[var(--color-ink)] bg-[var(--color-ink)] font-medium text-[var(--color-card)]'
                : 'border-[var(--color-line-strong)] bg-transparent text-[var(--color-ink-soft)] hover:border-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {k === 'this' ? t('thisMonth') : k === 'last3' ? t('last3Months') : k === 'last12' ? t('last12Months') : t('customRange')}
          </button>
        ))}
        {rangeKey === 'custom' && (
          <>
            <input type="month" aria-label={t('from')} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="cell-input w-auto!" />
            <span className="text-xs text-[var(--color-ink-faint)]">→</span>
            <input type="month" aria-label={t('to')} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="cell-input w-auto!" />
          </>
        )}
        <Select aria-label={t('categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
      </div>

      {/* 01 大数字指标版：区间净利 + 收入/投流/费用 */}
      <section data-testid="dashboard-metrics" className="editorial-enter-late grid overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] xl:grid-cols-12">
        <div className="flex min-h-[230px] flex-col justify-between border-b border-[var(--color-line)] p-6 md:p-8 xl:col-span-5 xl:border-b-0 xl:border-r">
          <div className="flex items-start justify-between gap-4">
            <div className="editorial-kicker">{t('netBalance')} / {t('metricDefinition')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">01</span>
          </div>
          <div className={`num my-7 text-[72px] font-light leading-[0.85] tracking-[-0.06em] md:text-[88px] ${totals.netCents < 0 ? 'text-[var(--color-bad)]' : 'text-[var(--color-ink)]'}`}>
            <span className="text-[36px] tracking-normal text-[var(--color-ink-faint)]">¥</span>{fmtCents(totals.netCents)}
          </div>
          <p className="max-w-[320px] border-t border-[var(--color-line)] pt-4 text-[12px] leading-5 text-[var(--color-ink-soft)]">
            {t('netBalanceHint')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 xl:col-span-7">
          <MetricCell label={t('revenue')} cents={totals.revenueCents} index="02" caption="REVENUE" />
          <MetricCell label={t('trafficCost')} cents={totals.trafficCents} index="03" caption="TRAFFIC" />
          <div className="p-6 sm:col-span-2 md:p-7">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[11px] text-[var(--color-ink-soft)]">{t('expenseTotal')}</div>
              <div className="text-[9px] tracking-[0.14em] text-[var(--color-ink-faint)]">EXPENSES</div>
            </div>
            <div className="num mt-4 flex items-end gap-4">
              <div className="num text-[40px] font-light leading-none tracking-[-0.05em]">
                <Amount cents={totals.expenseCents} />
              </div>
              <div className="pb-1 text-[12px] leading-5 text-[var(--color-ink-soft)]">{t('expenseTotalHint')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 月度趋势（区间多于一个月时出现） */}
      {overview.length > 1 && (
        <section data-testid="monthly-trend" className="editorial-enter-late">
          <SectionHeading
            index="02"
            title={<span className="flex items-center gap-1.5">{t('monthlyOverview')}（{fromMonth} ~ {toMonth}）{defIcon('monthly_overview')}</span>}
          />
          <div className="h-56 border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45 p-4">
            <ResponsiveContainer>
              <BarChart data={overview.map((m) => ({ month: m.month, [t('revenue')]: m.revenueCents / 100, [t('trafficCost')]: m.trafficCents / 100, [t('expenseTotal')]: m.expenseCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="month" fontSize={11} stroke={CHART.tick} tickLine={false} />
                <YAxis fontSize={11} stroke={CHART.tick} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t('revenue')} fill={CHART.series[0]} />
                <Bar dataKey={t('trafficCost')} fill={CHART.series[1]} />
                <Bar dataKey={t('expenseTotal')} fill={CHART.series[2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* 03 账号盈亏排行 */}
      <section data-testid="account-pnl" className="editorial-enter-late">
        <SectionHeading
          index="03"
          title={<span className="flex items-center gap-1.5">{t('accountPnl')} {defIcon('account_pnl')}</span>}
          aside={<span className="num">{pnl.length} {t('accountsUnit')}</span>}
        />
        {pnl.length === 0 ? (
          <div className="border-b border-[var(--color-line)] py-12 text-center text-[13px] text-[var(--color-ink-soft)]">—</div>
        ) : (
          <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
            <table className="w-full min-w-[42rem] text-[13px]">
              <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
                <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                  <th>{t('account')}</th>
                  <th>{t('categoryLabel')}</th>
                  <th className="text-right">{t('totalInvested')}</th>
                  <th className="text-right">{t('totalRevenue')}</th>
                  <th className="text-right">{t('netPnl')}</th>
                </tr>
              </thead>
              <tbody>
                {pnl.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5" onClick={() => navigate(`accounts/${r.id}`)}>
                    <td>
                      <span className="display-type editorial-link text-[15px] font-semibold">{r.name}</span>
                      {r.status === 'sealed' && <Badge tone="red">{t('statusSealed')}</Badge>}
                    </td>
                    <td className="text-[var(--color-ink-soft)]">{r.category}</td>
                    <td className="text-right"><Amount cents={r.totalInvestedCents} /></td>
                    <td className="text-right"><Amount cents={r.revenueCents} /></td>
                    <td className={`text-right font-medium ${r.netCents < 0 ? 'text-[var(--color-bad)]' : ''}`}><Amount cents={r.netCents} signed /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        {/* 04 赛道收入对比 */}
        <section className="editorial-enter-late">
          <SectionHeading index="04" title={<span className="flex items-center gap-1.5">{t('categoryRevenue')} {defIcon('category_revenue')}</span>} />
          <CategoryChart rows={catRevenue} />
        </section>

        {/* 05 客户贡献排行 + 复购提醒 */}
        <section className="editorial-enter-late">
          <SectionHeading
            index="05"
            title={<span className="flex items-center gap-1.5">{t('customerContribution')} {defIcon('customer_contribution')}</span>}
            aside={(
              <Select aria-label={t('customerType')} value={customerType} onChange={(e) => setCustomerType(e.target.value)} className="w-auto! rounded-full py-1 text-[12px]">
                <option value="">{t('allTypes')}</option>
                <option value="brand">{t('typeBrand')}</option>
                <option value="agency">{t('typeAgency')}</option>
                <option value="platform">{t('typePlatform')}</option>
              </Select>
            )}
          />
          <div className="border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
            <table className="w-full text-[13px]">
              <tbody>
                {contribution.map((r, i) => (
                  <tr key={r.id} className="cursor-pointer border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3" onClick={() => navigate(`customers/${r.id}`)}>
                    <td className="num w-8 text-[10px] text-[var(--color-ink-faint)]">{String(i + 1).padStart(2, '0')}</td>
                    <td><span className="display-type editorial-link text-[15px] font-semibold">{r.name}</span></td>
                    <td className="text-[11px] text-[var(--color-ink-soft)]">
                      {r.type === 'brand' ? t('typeBrand') : r.type === 'agency' ? t('typeAgency') : t('typePlatform')}
                    </td>
                    <td className="text-right"><Amount cents={r.totalCents} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reminders.length > 0 && (
            <div className="mt-4">
              <div className="editorial-kicker mb-2">{t('repurchaseReminders')} {defIcon('repurchase_reminders')}</div>
              <ul className="flex flex-col">
                {reminders.map((r) => (
                  <li key={r.id} className="flex cursor-pointer items-center justify-between border-b border-[var(--color-line)] px-1 py-2 text-[13px] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60" onClick={() => navigate(`customers/${r.id}`)}>
                    <span>{r.name}</span>
                    <span className="num text-[12px] text-[var(--color-warn)]">{t('daysUnit', { n: r.daysSinceLastOrder })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* 06 闲置账号预警 */}
      <section data-testid="idle-accounts" className="editorial-enter-late">
        <SectionHeading
          index="06"
          title={<span className="flex items-center gap-1.5">{t('idleAccounts')} {defIcon('idle_accounts')}</span>}
          aside={<span className="num">{idle.length}</span>}
        />
        {idle.length === 0 ? (
          <div className="border-b border-[var(--color-line)] py-12 text-center text-[13px] text-[var(--color-ink-soft)]">—</div>
        ) : (
          <ul className="grid gap-x-8 border-b border-[var(--color-line-strong)] md:grid-cols-2">
            {idle.map((r) => (
              <li
                key={r.id}
                className="flex cursor-pointer items-center justify-between border-b border-[var(--color-line)] px-1 py-3 text-[13px] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60"
                onClick={() => navigate(`accounts/${r.id}`)}
              >
                <span><span className="display-type text-[15px] font-semibold">{r.name}</span> <span className="ml-1 text-[11px] text-[var(--color-ink-soft)]">{r.category}</span></span>
                <span className="num text-[12px] text-[var(--color-warn)]">
                  {r.daysSinceLastOrder == null ? t('neverOrdered') : t('daysUnit', { n: r.daysSinceLastOrder })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MetricCell({ label, cents, index, caption }: { label: string; cents: number; index: string; caption: string }) {
  return (
    <div className="border-b border-[var(--color-line)] p-6 sm:border-r sm:[&:nth-child(2)]:border-r-0 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] text-[var(--color-ink-soft)]">{label}</div>
        <span className="num text-[10px] text-[var(--color-ink-faint)]">{index}</span>
      </div>
      <div className="num mt-5 text-[40px] font-light leading-none tracking-[-0.05em]">
        <Amount cents={cents} />
      </div>
      <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">{caption}</div>
    </div>
  );
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, boot } = useStore();
  return (
    <Select aria-label={t('ownerLabel')} value={value} onChange={(e) => onChange(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
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
  if (data.rows.length === 0) return <div className="border-b border-[var(--color-line)] py-12 text-center text-[13px] text-[var(--color-ink-soft)]">—</div>;
  return (
    <div className="h-56 border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45 p-4">
      <ResponsiveContainer>
        <BarChart data={data.rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" fontSize={11} stroke={CHART.tick} tickLine={false} />
          <YAxis fontSize={11} stroke={CHART.tick} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => `¥${fmtCents(Number(v) * 100)}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.cats.map((c, i) => <Bar key={c} dataKey={c} stackId="a" fill={CHART.series[i % CHART.series.length]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
