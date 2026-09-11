// 关键交互：S1 新建账号 —— 页面上有「自动生成买入投入」的事前提示；提交按元转分；成功后刷新列表
import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsPage } from './AccountsPage';
import { mockApi, bootAdmin, renderWithStore } from '../test/helpers';

describe('S1 建账号自动买入提示', () => {
  it('表单区展示自动买入提示；提交时 purchaseCostCents 按元×100 转换；成功后 toast + 列表重拉', async () => {
    let accountCount = 0;
    const calls = mockApi({
      'GET /api/bootstrap': { ...bootAdmin },
      'GET /api/accounts': () => ({ json: { accounts: accountCount ? [{ id: 1, name: '美妆一号', category: '美妆', status: 'warming', purchasedAt: 1767830400000, ownerId: null, note: null, createdAt: 1, updatedAt: 1, deletedAt: null }] : [] } }),
      'POST /api/accounts': () => {
        accountCount = 1;
        return { json: { id: 1, name: '美妆一号', category: '美妆', status: 'warming', purchasedAt: 1767830400000, ownerId: null, note: null, createdAt: 1, updatedAt: 1, deletedAt: null } };
      },
    });
    renderWithStore(<AccountsPage />);

    // 事前提示：保存后自动生成买入投入记录（新建表单区 + 空态各一处）
    expect((await screen.findAllByText(/自动生成一条「买入」投入记录/)).length).toBeGreaterThanOrEqual(1);

    await userEvent.type(screen.getByLabelText('账号名'), '美妆一号');
    await userEvent.type(screen.getByLabelText('赛道', { selector: 'input' }), '美妆');
    fireEvent.change(screen.getByLabelText('买入日期'), { target: { value: '2026-01-08' } });
    await userEvent.type(screen.getByLabelText('买入成本（元）'), '1500');
    await userEvent.click(screen.getByRole('button', { name: '新建' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/accounts');
      expect(post).toBeTruthy();
      const body = post!.body as Record<string, unknown>;
      expect(body.purchaseCostCents).toBe(150000);
      expect(body.purchasedAt).toBe(Date.UTC(2026, 0, 8));
    });
    // toast 反馈 + 列表重拉出现新账号
    expect(await screen.findAllByText('美妆一号')).not.toHaveLength(0);
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.url === '/api/accounts').length).toBeGreaterThanOrEqual(2));
  });
});
