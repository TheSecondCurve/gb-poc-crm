// 关键交互：S8 标记已封死 —— 必须 Modal 二次确认且写明影响范围；确认后才发 PATCH
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDetailPage } from './AccountDetailPage';
import { mockApi, bootAdmin, renderWithStore } from '../test/helpers';

const detail = {
  account: {
    id: 1, name: '美妆一号', category: '美妆', status: 'warming',
    purchasedAt: 1767830400000, ownerId: 1, note: null,
    createdAt: 1, updatedAt: 1, deletedAt: null,
    totals: { totalInvestedCents: 180000, purchaseCents: 150000, trafficCents: 30000, totalRevenueCents: 120000, orderCount: 1, lastOrderAt: 1773532800000 },
    investments: [],
    orders: [],
  },
};

const valuation = {
  metric: 'account_valuation',
  result: {
    rows: [{
      accountId: 1, name: '美妆一号', category: '美妆', totalRevenueCents: 120000, valuationCents: 120000,
      basis: { months: 6, multiplier: 6, windowStart: 1761955200000, windowEnd: 1779148800000, totalRevenueCents: 120000, monthlyAvgCents: 20000 },
    }],
  },
};

describe('S8 封死二次确认', () => {
  it('点击「标记已封死」先弹确认框写明影响；确认后才发 PATCH status=sealed', async () => {
    const calls = mockApi({
      'GET /api/bootstrap': { ...bootAdmin },
      'GET /api/accounts/1': { ...detail },
      'POST /api/metrics/query': { ...valuation },
      'PATCH /api/accounts/1': () => ({ json: { ...detail.account, status: 'sealed' } }),
    });
    renderWithStore(<AccountDetailPage id={1} />);

    // 估值小卡含计算依据（S9）
    expect(await screen.findByText(/近 6 个月平均月收入 × 6/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '标记已封死' }));
    // 确认框写明影响：历史投入与收入保留、不再出现在闲置预警
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('历史投入与收入会保留');
    expect(dialog).toHaveTextContent('不再出现在闲置预警');
    // 未确认前不发 PATCH
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();

    await userEvent.click(within(dialog).getByRole('button', { name: '标记已封死' }));
    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.url === '/api/accounts/1');
      expect(patch).toBeTruthy();
      expect((patch!.body as Record<string, unknown>).status).toBe('sealed');
    });
  });

  it('Esc 取消确认框，不发任何 PATCH', async () => {
    const calls = mockApi({
      'GET /api/bootstrap': { ...bootAdmin },
      'GET /api/accounts/1': { ...detail },
      'POST /api/metrics/query': { ...valuation },
    });
    renderWithStore(<AccountDetailPage id={1} />);
    await userEvent.click(await screen.findByRole('button', { name: '标记已封死' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });
});
