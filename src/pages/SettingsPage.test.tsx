// S10/S11 设置页危险区：member 不渲染；wipe 需输入确认词；seed 成功后 Toast 统计
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { ToastHost } from '../components/ui';
import { mockApi, bootAdmin, renderWithStore } from '../test/helpers';

const bootMember = {
  ...bootAdmin,
  user: { ...bootAdmin.user, id: 2, username: 'staff', role: 'member' as const },
};

const seedStats = {
  stats: {
    accounts: 45, customers: 41, orders: 2200, investments: 300, expenses: 90,
    months: 37, fromMonth: '2023-09', toMonth: '2026-09', totalRevenueCents: 120000000,
  },
};

function mockSettingsApis(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/bootstrap': bootAdmin,
    'GET /api/audit-log': { entries: [] },
    'GET /api/v1/auth/tokens': { tokens: [] },
    ...extra,
  });
}

describe('S10/S11 危险区', () => {
  it('S11: member 看不到危险区，admin 可见', async () => {
    mockSettingsApis();
    const { unmount } = renderWithStore(<SettingsPage />);
    expect(await screen.findByText('危险区')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '初始化演示数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除全部业务数据' })).toBeInTheDocument();
    unmount();

    mockSettingsApis({ 'GET /api/bootstrap': bootMember });
    renderWithStore(<SettingsPage />);
    expect(await screen.findByText('令牌管理（Agent 接入）')).toBeInTheDocument();
    expect(screen.queryByText('危险区')).not.toBeInTheDocument();
  });

  it('S11: 清除需输入确认词「清除」才可点确认，确认后调 wipe 端点', async () => {
    const calls = mockSettingsApis({ 'POST /api/admin/wipe-data': { ok: true } });
    renderWithStore(<><SettingsPage /><ToastHost /></>);
    await userEvent.click(await screen.findByRole('button', { name: '清除全部业务数据' }));

    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: '清除全部业务数据' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('确认词'), '不对的词');
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('确认词'));
    await userEvent.type(within(dialog).getByLabelText('确认词'), '清除');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(await screen.findByText('全部业务数据已清除')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/admin/wipe-data')).toBe(true);
  });

  it('S10: 初始化演示数据成功后 Toast 显示统计', async () => {
    const calls = mockSettingsApis({ 'POST /api/admin/seed-demo': seedStats });
    renderWithStore(<><SettingsPage /><ToastHost /></>);
    await userEvent.click(await screen.findByRole('button', { name: '初始化演示数据' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '初始化演示数据' }));
    expect(await screen.findByText(/已生成：45 个账号/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/admin/seed-demo')).toBe(true);
  });
});
