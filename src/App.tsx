// 根组件：bootstrap 拉取 → 未登录跳登录页；hash 路由分发
import { useStore } from './store';
import { useHashRoute } from './router';
import { Spinner, ToastHost } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const { boot, bootLoading } = useStore();
  const route = useHashRoute();

  if (bootLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-paper"><Spinner /></div>;
  }
  if (!boot) return <LoginPage />;

  let page: React.ReactNode;
  switch (route.page) {
    case 'accounts':
      page = route.id ? <AccountDetailPage id={route.id} /> : <AccountsPage />;
      break;
    case 'orders':
      page = <OrdersPage />;
      break;
    case 'investments':
      page = <InvestmentsPage />;
      break;
    case 'customers':
      page = route.id ? <CustomerDetailPage id={route.id} /> : <CustomersPage />;
      break;
    case 'expenses':
      page = <ExpensesPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <DashboardPage />;
  }

  return (
    <>
      <Layout>{page}</Layout>
      <ToastHost />
    </>
  );
}
