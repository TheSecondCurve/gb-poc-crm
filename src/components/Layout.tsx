// 布局骨架：左侧固定 Sidebar（导航 + 账号分组列表 + 底部设置区），主区单页滚动；
// 移动端折叠为顶栏 + 抽屉 + 遮罩（点击导航后自动收起）
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, Users, Megaphone, Wallet, Receipt, Contact, Settings, LogOut, Menu, X } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate, useHashRoute } from '../router';
import { Badge } from './ui';
import type { Account } from '../types';

const NAV = [
  { page: 'dashboard', icon: LayoutDashboard, key: 'navDashboard' },
  { page: 'accounts', icon: Users, key: 'navAccounts' },
  { page: 'orders', icon: Megaphone, key: 'navOrders' },
  { page: 'investments', icon: Wallet, key: 'navInvestments' },
  { page: 'customers', icon: Contact, key: 'navCustomers' },
  { page: 'expenses', icon: Receipt, key: 'navExpenses' },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { t, user, logout } = useStore();
  const route = useHashRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.listAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
  }, [route.page]);

  const go = (to: string) => {
    navigate(to);
    setDrawerOpen(false);
  };

  const byCategory = new Map<string, Account[]>();
  for (const a of accounts) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }

  const statusTone = { warming: 'amber', active: 'green', sealed: 'red' } as const;
  const statusLabel = { warming: t('statusWarming'), active: t('statusActive'), sealed: t('statusSealed') } as const;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4 text-sm font-bold text-ink-900">{t('appName')}</div>
      <nav className="px-2">
        {NAV.map(({ page, icon: Icon, key }) => (
          <button
            key={page}
            onClick={() => go(page)}
            className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
              route.page === page ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-black/5'
            }`}
          >
            <Icon size={16} />
            {t(key)}
          </button>
        ))}
      </nav>
      <div className="mt-3 flex-1 overflow-y-auto border-t border-black/5 px-2 pt-3">
        <div className="px-2.5 pb-1 text-xs font-medium text-ink-400">{t('navBusiness')} · {t('navAccounts')}</div>
        {[...byCategory.entries()].map(([cat, list]) => (
          <div key={cat} className="mb-2">
            <div className="px-2.5 py-1 text-xs text-ink-400">{cat}</div>
            {list.map((a) => (
              <button
                key={a.id}
                onClick={() => go(`accounts/${a.id}`)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-left text-sm text-ink-600 hover:bg-black/5"
              >
                <span className="truncate">{a.name}</span>
                <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-black/5 px-2 py-2">
        <button
          onClick={() => go('settings')}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm ${route.page === 'settings' ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-black/5'}`}
        >
          <Settings size={16} />
          {t('navSettings')}
        </button>
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="truncate text-xs text-ink-400">{user?.displayName}（{user?.role === 'admin' ? t('roleAdmin') : t('roleMember')}）</span>
          <button onClick={() => void logout()} aria-label={t('logout')} className="rounded p-1 text-ink-400 hover:bg-black/5">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* 移动端顶栏 */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5 md:hidden">
        <button onClick={() => setDrawerOpen(true)} aria-label="menu" className="rounded p-1.5 hover:bg-black/5">
          <Menu size={18} />
        </button>
        <span className="text-sm font-semibold">{t('appName')}</span>
      </div>
      {/* 移动端抽屉 + 遮罩 */}
      {drawerOpen && (
        <div className="anim-fade fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="anim-pop h-full w-64 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2">
              <button onClick={() => setDrawerOpen(false)} aria-label="close" className="rounded p-1 hover:bg-black/5"><X size={16} /></button>
            </div>
            {sidebar}
          </div>
        </div>
      )}
      {/* 桌面端固定 Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-black/5 bg-white md:block">
        {sidebar}
      </aside>
      <main className="px-4 py-5 md:ml-60 md:px-6">{children}</main>
    </div>
  );
}
