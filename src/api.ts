// 手写 fetch 封装：统一携带凭据、统一错误（ApiError）、每个端点一个具名方法
import type {
  Account, AccountDetail, AdOrder, ApiErrorBody, AuditEntry, BootData,
  Customer, CustomerDetail, CustomerListItem, IssuedToken, MetricCard,
  OperatingExpense, AccountInvestment, PatToken, SeedStats, User,
} from './types';

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;
  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

function qs(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // 认证 / 启动
  bootstrap: () => get<BootData>('/api/bootstrap'),
  login: (username: string, password: string) =>
    post<{ user: User }>('/api/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout', {}),

  // 账号
  listAccounts: (f: { category?: string; ownerId?: number; status?: string } = {}) =>
    get<{ accounts: Account[] }>(`/api/accounts${qs(f)}`),
  createAccount: (b: { name: string; category: string; purchasedAt: number; purchaseCostCents: number; ownerId?: number | null; note?: string | null }) =>
    post<Account>('/api/accounts', b),
  getAccount: (id: number) => get<{ account: AccountDetail }>(`/api/accounts/${id}`),
  updateAccount: (id: number, b: Partial<{ name: string; category: string; status: string; purchasedAt: number; ownerId: number | null; note: string | null }>) =>
    patch<Account>(`/api/accounts/${id}`, b),
  deleteAccount: (id: number) => del<{ ok: true }>(`/api/accounts/${id}`),

  // 客户
  listCustomers: (f: { type?: string } = {}) => get<{ customers: CustomerListItem[] }>(`/api/customers${qs(f)}`),
  createCustomer: (b: { name: string; type: string; wechat?: string | null; note?: string | null }) =>
    post<Customer>('/api/customers', b),
  getCustomer: (id: number) => get<{ customer: CustomerDetail }>(`/api/customers/${id}`),
  updateCustomer: (id: number, b: Partial<{ name: string; type: string; wechat: string | null; note: string | null }>) =>
    patch<Customer>(`/api/customers/${id}`, b),
  deleteCustomer: (id: number) => del<{ ok: true }>(`/api/customers/${id}`),

  // 广告订单
  listOrders: (f: { accountId?: number; customerId?: number; channel?: string; from?: number; to?: number } = {}) =>
    get<{ orders: AdOrder[] }>(`/api/orders${qs(f)}`),
  createOrder: (b: {
    accountId: number; customerId?: number;
    newCustomer?: { name: string; type: string; wechat?: string | null };
    brand?: string | null; product?: string | null; brief?: string | null;
    amountCents: number; channel: string; publishedAt: number;
  }) => post<AdOrder>('/api/orders', b),
  updateOrder: (id: number, b: Partial<{ accountId: number; customerId: number; brand: string | null; product: string | null; brief: string | null; amountCents: number; channel: string; publishedAt: number }>) =>
    patch<AdOrder>(`/api/orders/${id}`, b),
  deleteOrder: (id: number) => del<{ ok: true }>(`/api/orders/${id}`),

  // 投入
  listInvestments: (f: { accountId?: number; type?: string; from?: number; to?: number } = {}) =>
    get<{ investments: AccountInvestment[] }>(`/api/investments${qs(f)}`),
  createInvestment: (b: { accountId: number; type: string; amountCents: number; spentAt: number; note?: string | null }) =>
    post<AccountInvestment>('/api/investments', b),
  updateInvestment: (id: number, b: Partial<{ type: string; amountCents: number; spentAt: number; note: string | null }>) =>
    patch<AccountInvestment>(`/api/investments/${id}`, b),
  deleteInvestment: (id: number) => del<{ ok: true }>(`/api/investments/${id}`),

  // 费用
  listExpenses: (f: { category?: string; from?: number; to?: number } = {}) =>
    get<{ expenses: OperatingExpense[] }>(`/api/expenses${qs(f)}`),
  createExpense: (b: { category: string; amountCents: number; spentAt: number; note?: string | null }) =>
    post<OperatingExpense>('/api/expenses', b),
  updateExpense: (id: number, b: Partial<{ category: string; amountCents: number; spentAt: number; note: string | null }>) =>
    patch<OperatingExpense>(`/api/expenses/${id}`, b),
  deleteExpense: (id: number) => del<{ ok: true }>(`/api/expenses/${id}`),

  // 指标（唯一取数入口，口径由后端指标定义层统一）
  metricsCatalog: () => get<{ metrics: MetricCard[] }>('/api/metrics'),
  queryMetric: <R>(metric: string, params: Record<string, unknown> = {}) =>
    post<{ metric: string; result: R }>('/api/metrics/query', { metric, params }),

  // 设置
  getSettings: () => get<{ settings: Record<string, string> }>('/api/settings'),
  updateSetting: (key: string, value: string) => patch<{ key: string; value: string }>('/api/settings', { key, value }),
  // 管理员工具（S10/S11，仅 admin）
  seedDemo: () => post<{ stats: SeedStats }>('/api/admin/seed-demo', {}),
  wipeData: () => post<{ ok: true }>('/api/admin/wipe-data', {}),

  // 用户（admin）
  listUsers: () => get<{ users: User[] }>('/api/users'),
  createUser: (b: { username: string; password: string; displayName: string; role: string }) =>
    post<User>('/api/users', b),
  updateUser: (id: number, b: Partial<{ displayName: string; role: string; password: string; disable: boolean }>) =>
    patch<User>(`/api/users/${id}`, b),

  // 令牌
  listTokens: () => get<{ tokens: PatToken[] }>('/api/v1/auth/tokens'),
  issueToken: (username: string, password: string, scope: string) =>
    post<IssuedToken>('/api/v1/auth/tokens', { username, password, scope }),
  revokeToken: (id: number) => del<{ ok: true }>(`/api/v1/auth/tokens/${id}`),

  // 审计（admin）
  auditLog: () => get<{ entries: AuditEntry[] }>('/api/audit-log'),
};
