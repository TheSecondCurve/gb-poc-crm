// 关键交互：登录流（session cookie）——未登录显示登录页，错误密码提示，登录成功进入应用骨架
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { mockApi, bootAdmin, renderWithStore } from '../test/helpers';

describe('登录流', () => {
  it('未登录 → 登录页；错误密码 → 错误提示；正确密码 → 进入应用看到导航', async () => {
    let authed = false;
    const calls = mockApi({
      'GET /api/bootstrap': () => (authed ? { json: bootAdmin } : { status: 401, json: { error: 'unauthorized' } }),
      'POST /api/auth/login': (body: Record<string, unknown> | undefined) => {
        if (body?.password === 'admin-pass-123') {
          authed = true;
          return { json: { user: bootAdmin.user } };
        }
        return { status: 401, json: { error: 'invalid_credentials', message: '用户名或密码错误' } };
      },
      'GET /api/accounts': { accounts: [] },
      'GET /api/metrics': { metrics: [] },
    });
    renderWithStore(<App />);

    // 未登录 → 登录页
    expect(await screen.findByText('登录', { selector: 'p' })).toBeInTheDocument();

    // 错误密码 → 错误提示
    await userEvent.type(screen.getByLabelText('用户名'), 'admin');
    await userEvent.type(screen.getByLabelText('密码'), 'wrong-pass-1');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误');

    // 正确密码 → bootstrap 通过 → 看到侧边导航
    await userEvent.clear(screen.getByLabelText('密码'));
    await userEvent.type(screen.getByLabelText('密码'), 'admin-pass-123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('经营看板')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/bootstrap').length).toBeGreaterThanOrEqual(2));
  });
});
