// 前端测试助手：fetch mock（按 METHOD /path 路由）+ StoreProvider 渲染
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { StoreProvider } from '../store';
import type { BootData, User } from '../types';

export interface FetchCall {
  method: string;
  url: string;
  body?: unknown;
}

type Handler = (body: Record<string, unknown> | undefined, url: string) => { status?: number; json: unknown };

export const adminUser: User = {
  id: 1, username: 'admin', displayName: '管理员', role: 'admin',
  disabledAt: null, createdAt: 1, updatedAt: 1,
};

export const bootAdmin: BootData = {
  user: adminUser,
  settings: { idle_threshold_days: '30', repurchase_threshold_days: '30' },
  users: [adminUser],
};

export function mockApi(handlers: Record<string, unknown | Handler>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, url, body });
    const path = url.split('?')[0];
    const entry = handlers[`${method} ${path}`];
    if (entry === undefined) {
      return new Response(JSON.stringify({ error: 'not_found', message: '资源不存在' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const out = typeof entry === 'function' ? entry(body, url) : { json: entry };
    return new Response(JSON.stringify(out.json), { status: out.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return calls;
}

export function renderWithStore(ui: ReactElement) {
  return render(<StoreProvider>{ui}</StoreProvider>);
}
