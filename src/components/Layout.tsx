// 布局骨架：完全照搬 gb-pmo 编辑部外壳 —— 左侧刊物目录（Brand + 眉题导航 + 账号索引 + 成员面板），
// 主区 app-canvas 单页滚动；移动端折叠为顶栏 + 抽屉 + 遮罩（点导航/路由变化后自动收起）
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, Users, Megaphone, Wallet, Receipt, Contact, Settings, LogOut, Menu, X } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate, useHashRoute } from '../router';
import { Badge } from './ui';
import { Brand } from './editorial';
import type { Account } from '../types';

const NAV = [
  { page: 'dashboard', icon: LayoutDashboard, key: 'navDashboard' },
  { page: 'accounts', icon: Users, key: 'navAccounts' },
  { page: 'orders', icon: Megaphone, key: 'navOrders' },
  { page: 'investments', icon: Wallet, key: 'navInvestments' },
  { page: 'customers', icon: Contact, key: 'navCustomers' },
  { page: 'expenses', icon: Receipt, key: 'navExpenses' },
  { page: 'settings', icon: Settings, key: 'navSettings' },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { t, user, logout } = useStore();
  const route = useHashRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.listAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
  }, [route.page]);

  // 路由变化即收起移动端抽屉（点链接 / 前进后退统一走这里）
  useEffect(() => {
    const h = () => setDrawerOpen(false);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

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

  const navigation = (mobile = false) => (
    <nav aria-label={mobile ? '移动导航' : undefined} className={`flex-1 ${mobile ? 'px-3 py-3' : 'px-4 py-5'}`}>
      {!mobile && <div className="editorial-kicker mb-4 px-2">{t('navBusiness')}</div>}
      {NAV.map(({ page, icon: Icon, key }, index) => {
        const active = route.page === page;
        return (
          <button
            key={page}
            onClick={() => go(page)}
            className={`group relative mb-1 flex w-full items-center gap-3 rounded-[3px] px-3 py-2.5 text-[13px] transition-colors duration-150 ${
              active
                ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand-deep)]'
                : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]'
            }`}
          >
            <span aria-hidden="true" className={`absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 bg-[var(--color-brand)] transition-transform duration-150 ${active ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-50'}`} />
            <Icon aria-hidden="true" size={15} strokeWidth={1.6} />
            <span>{t(key)}</span>
            <span aria-hidden="true" className="num ml-auto text-[9px] tracking-[0.12em] opacity-55">{String(index + 1).padStart(2, '0')}</span>
          </button>
        );
      })}
    </nav>
  );

  const accountIndex = (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--color-line)] px-4 pb-4 pt-4">
      <div className="editorial-kicker mb-3 px-2">{t('navAccounts')}</div>
      {[...byCategory.entries()].map(([cat, list]) => (
        <div key={cat} className="mb-3">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">{cat}</div>
          {list.map((a) => (
            <button
              key={a.id}
              onClick={() => go(`accounts/${a.id}`)}
              className={`flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors ${
                route.id === a.id && route.page === 'accounts'
                  ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]'
                  : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]'
              }`}
            >
              <span className="truncate">{a.name}</span>
              <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge>
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  const memberPanel = (
    <div className="border-t border-[var(--color-line)] px-5 py-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="display-type flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-panel)] text-[14px]">{(user?.displayName ?? '·').slice(0, 1)}</div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium">{user?.displayName}</div>
          <div className="text-[10px] text-[var(--color-ink-soft)]">{user?.role === 'admin' ? t('roleAdmin') : t('roleMember')}</div>
        </div>
        <button
          onClick={() => void logout()} aria-label={t('logout')} title={t('logout')}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
        >
          <LogOut aria-hidden="true" size={13} />
        </button>
      </div>
      <div className="text-[9px] leading-4 tracking-[0.14em] text-[var(--color-ink-faint)]">KEEP EVERY ACCOUNT SEEN</div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-line)] px-5 py-6"><Brand /></div>
      {navigation()}
      {accountIndex}
      {memberPanel}
    </div>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 移动端顶栏（<768px）：导航入口在抽屉里，桌面端隐藏本栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-card)] px-4 md:hidden">
        <Brand compact />
        <button
          type="button" aria-label={drawerOpen ? '关闭菜单' : '打开菜单'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-panel)]"
          onClick={() => setDrawerOpen(!drawerOpen)}
        ><Menu aria-hidden="true" size={20} /></button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fade-in absolute inset-0 bg-[#171914]/45" onClick={() => setDrawerOpen(false)} />
          <aside className="pop-in absolute left-0 top-0 flex h-full w-72 flex-col border-r border-[var(--color-line)] bg-[var(--color-card)]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
              <Brand compact />
              <button
                type="button" aria-label="关闭菜单"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-panel)]"
                onClick={() => setDrawerOpen(false)}
              ><X aria-hidden="true" size={18} /></button>
            </div>
            {navigation(true)}
            {accountIndex}
            {memberPanel}
          </aside>
        </div>
      )}

      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-card)] md:flex lg:w-60">
        {sidebar}
      </aside>

      <main className="app-canvas min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1500px] p-5 md:p-8 xl:px-10">{children}</div>
      </main>
    </div>
  );
}
