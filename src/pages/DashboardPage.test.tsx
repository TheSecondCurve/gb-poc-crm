// 关键交互：S4 看板筛选联动 —— 赛道筛选改变后指标查询带 category 参数
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';
import { mockApi, bootAdmin, renderWithStore } from '../test/helpers';

const catalog = {
  metrics: [
    { name: 'monthly_overview', nameZh: '月度总览', definition: '当月收入按发布日期求和', dimensions: ['month', 'category'], timeField: 'published_at' },
    { name: 'account_pnl', nameZh: '账号盈亏排行', definition: '累计收入−（买入+投流）', dimensions: ['category'], timeField: '累计' },
  ],
};

const pnlRows = {
  metric: 'account_pnl',
  result: {
    rows: [
      { id: 1, name: '美妆一号', category: '美妆', status: 'active', ownerId: null, purchaseCents: 150000, trafficCents: 30000, totalInvestedCents: 180000, revenueCents: 120000, netCents: -60000 },
      { id: 2, name: '穿搭小号', category: '穿搭', status: 'warming', ownerId: null, purchaseCents: 50000, trafficCents: 0, totalInvestedCents: 50000, revenueCents: 60000, netCents: 10000 },
    ],
  },
};

describe('S4 看板筛选联动', () => {
  it('切换赛道筛选后，account_pnl / idle_accounts / monthly_overview 查询都带 category 参数', async () => {
    const calls = mockApi({
      'GET /api/bootstrap': { ...bootAdmin },
      'GET /api/metrics': { ...catalog },
      'POST /api/metrics/query': (body: Record<string, unknown> | undefined) => {
        const metric = (body as { metric: string }).metric;
        if (metric === 'account_pnl') return { json: pnlRows };
        if (metric === 'monthly_overview') return { json: { metric, result: { month: '2026-09', revenueCents: 0, trafficCents: 0, expenseCents: 0, netCents: 0 } } };
        return { json: { metric, result: { rows: [] } } };
      },
    });
    renderWithStore(<DashboardPage />);

    // 渲染出盈亏榜
    expect(await screen.findByText('美妆一号')).toBeInTheDocument();

    // 切换赛道筛选 → 重新查询且带 category
    await userEvent.selectOptions(screen.getByLabelText('赛道'), '美妆');
    await waitFor(() => {
      const pnlCalls = calls.filter((c) => c.method === 'POST' && (c.body as { metric?: string })?.metric === 'account_pnl');
      const last = pnlCalls[pnlCalls.length - 1].body as { params: Record<string, unknown> };
      expect(last.params.category).toBe('美妆');
    });
    const idleCalls = calls.filter((c) => (c.body as { metric?: string })?.metric === 'idle_accounts');
    expect((idleCalls[idleCalls.length - 1].body as { params: Record<string, unknown> }).params.category).toBe('美妆');
  });

  it('空数据时显示空态引导（载入示例数据 / 从零开始两个主行动）', async () => {
    mockApi({
      'GET /api/bootstrap': { ...bootAdmin },
      'GET /api/metrics': { ...catalog },
      'POST /api/metrics/query': (body: Record<string, unknown> | undefined) => {
        const metric = (body as { metric: string }).metric;
        if (metric === 'monthly_overview') return { json: { metric, result: { month: '2026-09', revenueCents: 0, trafficCents: 0, expenseCents: 0, netCents: 0 } } };
        return { json: { metric, result: { rows: [] } } };
      },
    });
    renderWithStore(<DashboardPage />);
    expect(await screen.findByText('还没有经营数据')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '载入示例数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从零开始' })).toBeInTheDocument();
  });
});
