// 与后端 API 共享的类型定义（JSON camelCase、金额分、epoch 毫秒）

export type Role = 'admin' | 'member';
export type AccountStatus = 'warming' | 'active' | 'sealed';
export type CustomerType = 'brand' | 'agency' | 'platform';
export type OrderChannel = 'private' | 'platform';
export type InvestmentType = 'purchase' | 'traffic';
export type ExpenseCategory = 'salary' | 'office' | 'other';
export type TokenScope = 'read' | 'write';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  disabledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AccountTotals {
  totalInvestedCents: number;
  purchaseCents: number;
  trafficCents: number;
  totalRevenueCents: number;
  orderCount: number;
  lastOrderAt: number | null;
}

export interface Account {
  id: number;
  name: string;
  category: string;
  status: AccountStatus;
  purchasedAt: number | null;
  ownerId: number | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface AccountDetail extends Account {
  totals: AccountTotals;
  investments: AccountInvestment[];
  orders: AdOrder[];
}

export interface CustomerTotals {
  totalCents: number;
  orderCount: number;
  lastOrderAt: number | null;
}

export interface Customer {
  id: number;
  name: string;
  type: CustomerType;
  wechat: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface CustomerListItem extends Customer {
  totals: CustomerTotals;
}

export interface CustomerOrder extends AdOrder {
  accountName: string;
}

export interface CustomerDetail extends Customer {
  totals: CustomerTotals;
  orders: CustomerOrder[];
}

export interface AdOrder {
  id: number;
  accountId: number;
  customerId: number;
  brand: string | null;
  product: string | null;
  brief: string | null;
  amountCents: number;
  channel: OrderChannel;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: number | null;
  deletedAt: number | null;
}

export interface AccountInvestment {
  id: number;
  accountId: number;
  type: InvestmentType;
  amountCents: number;
  spentAt: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface OperatingExpense {
  id: number;
  category: ExpenseCategory;
  amountCents: number;
  spentAt: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface PatToken {
  id: number;
  userId: number;
  username: string;
  prefix: string;
  scope: TokenScope;
  expiresAt: number;
  revokedAt: number | null;
  revokedBy: number | null;
  createdAt: number;
}

export interface IssuedToken extends PatToken {
  token: string;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: number;
}

export interface BootData {
  user: User;
  settings: Record<string, string>;
  users: User[];
}

export interface MetricCard {
  name: string;
  nameZh: string;
  definition: string;
  dimensions: string[];
  timeField: string;
}

export interface MonthlyOverview {
  month: string;
  revenueCents: number;
  trafficCents: number;
  expenseCents: number;
  netCents: number;
}

export interface AccountPnlRow {
  id: number;
  name: string;
  category: string;
  status: AccountStatus;
  ownerId: number | null;
  purchaseCents: number;
  trafficCents: number;
  totalInvestedCents: number;
  revenueCents: number;
  netCents: number;
}

export interface IdleAccountRow {
  id: number;
  name: string;
  category: string;
  status: AccountStatus;
  ownerId: number | null;
  lastOrderAt: number | null;
  daysSinceLastOrder: number | null;
}

export interface CustomerContributionRow {
  id: number;
  name: string;
  type: CustomerType;
  totalCents: number;
  orderCount: number;
  lastOrderAt: number | null;
}

export interface CategoryRevenueRow {
  category: string;
  month: string;
  revenueCents: number;
  orderCount: number;
}

export interface RepurchaseReminderRow {
  id: number;
  name: string;
  type: CustomerType;
  lastOrderAt: number;
  totalCents: number;
  daysSinceLastOrder: number;
}

export interface AccountValuationRow {
  accountId: number;
  name: string;
  category: string;
  totalRevenueCents: number;
  valuationCents: number;
  basis: {
    months: number;
    multiplier: number;
    windowStart: number;
    windowEnd: number;
    totalRevenueCents: number;
    monthlyAvgCents: number;
  };
}

export interface SeedStats {
  accounts: number;
  customers: number;
  orders: number;
  investments: number;
  expenses: number;
  months: number;
  fromMonth: string;
  toMonth: string;
  totalRevenueCents: number;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
}
