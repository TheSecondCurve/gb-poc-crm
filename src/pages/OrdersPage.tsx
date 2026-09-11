// 广告订单页（S3）：列表 + 筛选 + 新建/编辑（客户可顺手新建）+ 多选批量删除浮动条
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDate, parseYuan, centsToYuanInput, dateInputToTs, tsToDateInput } from '../format';
import { Amount, Btn, Card, ConfirmModal, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import type { Account, AdOrder, CustomerListItem } from '../types';

export function OrdersPage() {
  const { t, toast, onApiError } = useStore();
  const [orders, setOrders] = useState<AdOrder[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [channel, setChannel] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<AdOrder | 'new' | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, a, c] = await Promise.all([
        api.listOrders(channel ? { channel } : {}),
        api.listAccounts(),
        api.listCustomers(),
      ]);
      setOrders(o.orders);
      setAccounts(a.accounts);
      setCustomers(c.customers);
      setSelected(new Set());
    } catch (err) {
      onApiError(err);
    }
  }, [channel, onApiError]);

  useEffect(() => { void load(); }, [load]);

  if (!orders) return <Spinner />;

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`;
  const customerName = (id: number) => customers.find((c) => c.id === id)?.name ?? `#${id}`;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doBatchDelete = async () => {
    setActing(true);
    try {
      for (const id of selected) await api.deleteOrder(id);
      toast(t('batchDeleted', { n: selected.size }));
      setBatchConfirm(false);
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={t('orderList')}
        extra={
          <div className="flex gap-2">
            <Select aria-label={t('channel')} value={channel} onChange={(e) => setChannel(e.target.value)} className="w-auto py-1 text-xs">
              <option value="">{t('all')}{t('channel')}</option>
              <option value="private">{t('channelPrivate')}</option>
              <option value="platform">{t('channelPlatform')}</option>
            </Select>
            <Btn variant="primary" onClick={() => setEditing('new')}>{t('newOrder')}</Btn>
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400">
              <th className="w-8 py-1" />
              <th className="py-1">{t('publishedAt')}</th>
              <th className="py-1">{t('account')}</th>
              <th className="py-1">{t('customer')}</th>
              <th className="py-1">{t('brand')}</th>
              <th className="py-1">{t('channel')}</th>
              <th className="py-1 text-right">{t('amount')}</th>
              <th className="py-1">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-black/5">
                <td className="py-1.5">
                  <input type="checkbox" aria-label={`select-${o.id}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                </td>
                <td className="py-1.5 num">{fmtDate(o.publishedAt)}</td>
                <td className="py-1.5">{accountName(o.accountId)}</td>
                <td className="py-1.5">{customerName(o.customerId)}</td>
                <td className="py-1.5">{o.brand ?? '—'}</td>
                <td className="py-1.5 text-ink-600">{o.channel === 'private' ? t('channelPrivate') : t('channelPlatform')}</td>
                <td className="py-1.5 text-right"><Amount cents={o.amountCents} /></td>
                <td className="py-1.5"><Btn onClick={() => setEditing(o)}>{t('edit')}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 批量操作浮动条 */}
      {selected.size > 0 && (
        <div className="anim-pop fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <span>{t('selected', { n: selected.size })}</span>
          <Btn variant="danger" onClick={() => setBatchConfirm(true)}>{t('batchDelete')}</Btn>
        </div>
      )}

      {editing && (
        <OrderModal
          order={editing === 'new' ? null : editing}
          accounts={accounts}
          customers={customers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {batchConfirm && (
        <ConfirmModal
          title={t('batchDelete')}
          desc={t('deleteOrdersDesc', { n: selected.size })}
          confirmLabel={t('delete')}
          onConfirm={() => void doBatchDelete()}
          onClose={() => setBatchConfirm(false)}
          loading={acting}
        />
      )}
    </div>
  );
}

function OrderModal({ order, accounts, customers, onClose, onSaved }: {
  order: AdOrder | null;
  accounts: Account[];
  customers: CustomerListItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, toast, onApiError } = useStore();
  const [accountId, setAccountId] = useState(order ? String(order.accountId) : '');
  const [customerId, setCustomerId] = useState(order ? String(order.customerId) : '');
  const [newCustomer, setNewCustomer] = useState<{ name: string; type: string; wechat: string } | null>(null);
  const [brand, setBrand] = useState(order?.brand ?? '');
  const [product, setProduct] = useState(order?.product ?? '');
  const [brief, setBrief] = useState(order?.brief ?? '');
  const [amount, setAmount] = useState(order ? centsToYuanInput(order.amountCents) : '');
  const [channel, setChannel] = useState(order?.channel ?? 'private');
  const [publishedAt, setPublishedAt] = useState(tsToDateInput(order?.publishedAt));
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountCents = parseYuan(amount);
    const ts = dateInputToTs(publishedAt);
    if (!accountId || amountCents == null || ts == null) return;
    if (!customerId && !newCustomer) return;
    setSaving(true);
    try {
      if (order) {
        await api.updateOrder(order.id, {
          accountId: Number(accountId),
          customerId: Number(customerId),
          brand: brand.trim() || null,
          product: product.trim() || null,
          brief: brief.trim() || null,
          amountCents,
          channel,
          publishedAt: ts,
        });
        toast(t('saved'));
      } else {
        await api.createOrder({
          accountId: Number(accountId),
          ...(newCustomer
            ? { newCustomer: { name: newCustomer.name, type: newCustomer.type, wechat: newCustomer.wechat || null } }
            : { customerId: Number(customerId) }),
          brand: brand.trim() || null,
          product: product.trim() || null,
          brief: brief.trim() || null,
          amountCents,
          channel,
          publishedAt: ts,
        });
        toast(t('created'));
      }
      onSaved();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={order ? t('editOrder') : t('newOrder')} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)} className="grid grid-cols-2 gap-3">
        <Field label={t('account')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}（{a.category}）</option>)}
          </Select>
        </Field>
        <Field label={t('customer')}>
          <div className="flex flex-col gap-2">
            <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setNewCustomer(null); }} disabled={newCustomer !== null}>
              <option value="">—</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {!order && (
              newCustomer ? (
                <div className="flex flex-col gap-2 rounded-md bg-paper p-2">
                  <TextInput placeholder={t('customerName')} value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  <div className="flex gap-2">
                    <Select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}>
                      <option value="brand">{t('typeBrand')}</option>
                      <option value="agency">{t('typeAgency')}</option>
                      <option value="platform">{t('typePlatform')}</option>
                    </Select>
                    <TextInput placeholder={t('wechat')} value={newCustomer.wechat} onChange={(e) => setNewCustomer({ ...newCustomer, wechat: e.target.value })} />
                  </div>
                  <Btn onClick={() => setNewCustomer(null)} className="self-start text-xs">{t('cancel')}</Btn>
                </div>
              ) : (
                <Btn onClick={() => setNewCustomer({ name: '', type: 'brand', wechat: '' })} className="self-start text-xs">{t('newCustomerInline')}</Btn>
              )
            )}
          </div>
        </Field>
        <Field label={t('brand')}><TextInput value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
        <Field label={t('product')}><TextInput value={product} onChange={(e) => setProduct(e.target.value)} /></Field>
        <Field label={t('brief')}><TextInput value={brief} onChange={(e) => setBrief(e.target.value)} /></Field>
        <Field label={t('amount')}><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label={t('channel')}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as 'private' | 'platform')}>
            <option value="private">{t('channelPrivate')}</option>
            <option value="platform">{t('channelPlatform')}</option>
          </Select>
        </Field>
        <Field label={t('publishedAt')}><TextInput type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} required /></Field>
        <div className="col-span-2 flex justify-end gap-2">
          <Btn onClick={onClose}>{t('cancel')}</Btn>
          <Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn>
        </div>
      </form>
    </Modal>
  );
}
