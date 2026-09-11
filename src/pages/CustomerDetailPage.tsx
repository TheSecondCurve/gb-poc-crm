// 客户详情（S5）：全部历史订单（日期/账号/品牌/产品/金额/brief）+ 累计口径 + 软删
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate } from '../format';
import { Amount, Badge, Btn, Card, ConfirmModal, Spinner } from '../components/ui';
import type { CustomerDetail } from '../types';

const typeLabel = { brand: 'typeBrand', agency: 'typeAgency', platform: 'typePlatform' } as const;
const typeTone = { brand: 'blue', agency: 'amber', platform: 'green' } as const;

export function CustomerDetailPage({ id }: { id: number }) {
  const { t, toast, onApiError } = useStore();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getCustomer(id);
      setCustomer(res.customer);
    } catch (err) {
      onApiError(err);
    }
  }, [id, onApiError]);

  useEffect(() => { void load(); }, [load]);

  if (!customer) return <Spinner />;

  const doDelete = async () => {
    setActing(true);
    try {
      await api.deleteCustomer(id);
      toast(t('deleted'));
      navigate('customers');
    } catch (err) {
      onApiError(err);
      setActing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Btn onClick={() => navigate('customers')} aria-label={t('back')}><ArrowLeft size={14} />{t('back')}</Btn>
        <h1 className="text-base font-bold text-ink-900">{customer.name}</h1>
        <Badge tone={typeTone[customer.type]}>{t(typeLabel[customer.type])}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs text-ink-400">{t('totalCentsLabel')}</div>
          <Amount cents={customer.totals.totalCents} className="text-lg font-semibold" />
        </Card>
        <Card className="p-3">
          <div className="text-xs text-ink-400">{t('orderCount')}</div>
          <span className="num text-lg font-semibold">{customer.totals.orderCount}</span>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-ink-400">{t('lastOrderAt')}</div>
          <span className="num text-lg font-semibold">{fmtDate(customer.totals.lastOrderAt)}</span>
        </Card>
      </div>

      <Card title={t('customerDetail')}>
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><div className="text-xs text-ink-400">{t('wechat')}</div><div className="mt-1 text-sm">{customer.wechat ?? '—'}</div></div>
          <div><div className="text-xs text-ink-400">{t('note')}</div><div className="mt-1 text-sm">{customer.note ?? '—'}</div></div>
        </div>
        <Btn onClick={() => setDeleteConfirm(true)}>{t('delete')}</Btn>
      </Card>

      <Card title={t('orderHistory')}>
        {customer.orders.length === 0 ? <p className="text-sm text-ink-400">{t('neverOrdered')}</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="py-1">{t('publishedAt')}</th>
                <th className="py-1">{t('account')}</th>
                <th className="py-1">{t('brand')}</th>
                <th className="py-1">{t('product')}</th>
                <th className="py-1">{t('brief')}</th>
                <th className="py-1 text-right">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((o) => (
                <tr key={o.id} className="cursor-pointer border-t border-black/5 hover:bg-black/[0.02]" onClick={() => navigate(`accounts/${o.accountId}`)}>
                  <td className="py-1.5 num">{fmtDate(o.publishedAt)}</td>
                  <td className="py-1.5">{o.accountName}</td>
                  <td className="py-1.5">{o.brand ?? '—'}</td>
                  <td className="py-1.5 text-ink-600">{o.product ?? '—'}</td>
                  <td className="max-w-40 truncate py-1.5 text-ink-600" title={o.brief ?? ''}>{o.brief ?? '—'}</td>
                  <td className="py-1.5 text-right"><Amount cents={o.amountCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {deleteConfirm && (
        <ConfirmModal
          title={t('delete')}
          desc={t('deleteCustomerDesc', { name: customer.name })}
          confirmLabel={t('delete')}
          onConfirm={() => void doDelete()}
          onClose={() => setDeleteConfirm(false)}
          loading={acting}
        />
      )}
    </div>
  );
}
