// 客户详情（S5）：版式照搬 gb-pmo —— 刊头（客户档案）+ 大数字合计版 + 全部历史订单（日期/账号/品牌/产品/金额/brief）+ 软删
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate } from '../format';
import { Amount, Badge, Btn, ConfirmModal, Spinner } from '../components/ui';
import { PageMasthead, SectionHeading } from '../components/editorial';
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
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('customerFileKicker')}
        title={customer.name}
        description={<>{t(typeLabel[customer.type])} · {t('wechat')} {customer.wechat ?? '—'}</>}
        aside={<Badge tone={typeTone[customer.type]}>{t(typeLabel[customer.type])}</Badge>}
        actions={(
          <Btn onClick={() => navigate('customers')} aria-label={t('back')}><ArrowLeft aria-hidden="true" size={14} />{t('back')}</Btn>
        )}
      />

      {/* 合计大数字版 */}
      <section data-testid="customer-totals" className="editorial-enter-late grid overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] md:grid-cols-3">
        <div className="border-b border-[var(--color-line)] p-6 md:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('totalCentsLabel')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">01</span>
          </div>
          <div className="num mt-5 text-[40px] font-light leading-none tracking-[-0.05em]"><Amount cents={customer.totals.totalCents} /></div>
          <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">TOTAL</div>
        </div>
        <div className="border-b border-[var(--color-line)] p-6 md:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('orderCount')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">02</span>
          </div>
          <div className="num mt-5 text-[40px] font-light leading-none tracking-[-0.05em]">{customer.totals.orderCount}</div>
          <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">ORDERS</div>
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('lastOrderAt')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">03</span>
          </div>
          <div className="num mt-5 text-[40px] font-light leading-none tracking-[-0.05em]">{fmtDate(customer.totals.lastOrderAt)}</div>
          <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">LAST ORDER</div>
        </div>
      </section>

      {/* 档案信息 */}
      <section className="editorial-enter-late">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{t('customerDetail')}</div>
          <Btn onClick={() => setDeleteConfirm(true)}>{t('delete')}</Btn>
        </div>
        <div className="grid grid-cols-2 gap-5 border-b border-[var(--color-line)] py-5 md:grid-cols-4">
          <div><div className="mb-1.5 text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{t('wechat')}</div><div className="text-[13px]">{customer.wechat ?? '—'}</div></div>
          <div><div className="mb-1.5 text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{t('note')}</div><div className="text-[13px]">{customer.note ?? '—'}</div></div>
        </div>
      </section>

      {/* 全部历史订单 */}
      <section className="editorial-enter-late">
        <SectionHeading index="01" title={t('orderHistory')} aside={<span className="num">{customer.orders.length} {t('ordersUnit')}</span>} />
        {customer.orders.length === 0 ? (
          <div className="border-b border-[var(--color-line)] py-12 text-center text-[13px] text-[var(--color-ink-soft)]">{t('neverOrdered')}</div>
        ) : (
          <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
            <table className="w-full min-w-[44rem] text-[13px]">
              <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
                <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                  <th>{t('publishedAt')}</th>
                  <th>{t('account')}</th>
                  <th>{t('brand')}</th>
                  <th>{t('product')}</th>
                  <th>{t('brief')}</th>
                  <th className="text-right">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5" onClick={() => navigate(`accounts/${o.accountId}`)}>
                    <td className="num whitespace-nowrap">{fmtDate(o.publishedAt)}</td>
                    <td><span className="display-type editorial-link text-[15px] font-semibold">{o.accountName}</span></td>
                    <td>{o.brand ?? '—'}</td>
                    <td className="text-[var(--color-ink-soft)]">{o.product ?? '—'}</td>
                    <td className="max-w-40 truncate text-[var(--color-ink-soft)]" title={o.brief ?? ''}>{o.brief ?? '—'}</td>
                    <td className="text-right"><Amount cents={o.amountCents} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
