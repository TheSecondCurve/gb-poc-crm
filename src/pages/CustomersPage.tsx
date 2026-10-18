// 客户页（S5）：版式照搬 gb-pmo —— 刊头 + 编辑部表格（类型/累计金额/最近合作）+ 新建/编辑；详情见 CustomerDetailPage
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate, fmtDateTime } from '../format';
import { Amount, Badge, Btn, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { PageMasthead } from '../components/editorial';
import type { CustomerListItem } from '../types';

const typeTone = { brand: 'blue', agency: 'amber', platform: 'green' } as const;
const typeLabel = { brand: 'typeBrand', agency: 'typeAgency', platform: 'typePlatform' } as const;

export function CustomersPage() {
  const { t, onApiError } = useStore();
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<CustomerListItem | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listCustomers(type ? { type } : {});
      setCustomers(res.customers);
    } catch (err) {
      onApiError(err);
    }
  }, [type, onApiError]);

  useEffect(() => { void load(); }, [load]);

  if (!customers) return <Spinner />;

  return (
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('customersKicker')}
        title={t('navCustomers')}
        description={t('customersDesc')}
        aside={(
          <div className="md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">CLIENT INDEX</div>
            <div className="num mt-2 text-[12px] text-[var(--color-ink-soft)]">{customers.length} {t('customersUnit')}</div>
          </div>
        )}
        actions={(
          <>
            <Select aria-label={t('customerType')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
              <option value="">{t('allTypes')}</option>
              <option value="brand">{t('typeBrand')}</option>
              <option value="agency">{t('typeAgency')}</option>
              <option value="platform">{t('typePlatform')}</option>
            </Select>
            <Btn variant="primary" onClick={() => setEditing('new')}>+ {t('newCustomer')}</Btn>
          </>
        )}
      />

      <section className="editorial-enter-late">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{t('customerList')}</div>
        </div>
        <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
          <table className="w-full min-w-[42rem] text-[13px]">
            <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
              <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                <th>{t('customerName')}</th>
                <th>{t('customerType')}</th>
                <th>{t('wechat')}</th>
                <th className="text-right">{t('totalCentsLabel')}</th>
                <th>{t('lastOrderAt')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5">
                  <td>
                    <span className="display-type editorial-link cursor-pointer text-[15px] font-semibold" onClick={() => navigate(`customers/${c.id}`)}>{c.name}</span>
                  </td>
                  <td><Badge tone={typeTone[c.type]}>{t(typeLabel[c.type])}</Badge></td>
                  <td className="text-[var(--color-ink-soft)]">{c.wechat ?? '—'}</td>
                  <td className="text-right"><Amount cents={c.totals.totalCents} /></td>
                  <td className="num whitespace-nowrap text-[var(--color-ink-soft)]" title={fmtDateTime(c.totals.lastOrderAt)}>{fmtDate(c.totals.lastOrderAt)}</td>
                  <td><Btn onClick={() => setEditing(c)}>{t('edit')}</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <CustomerModal
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

export function CustomerModal({ customer, onClose, onSaved }: {
  customer: CustomerListItem | null; onClose: () => void; onSaved: () => void;
}) {
  const { t, toast, onApiError } = useStore();
  const [name, setName] = useState(customer?.name ?? '');
  const [type, setType] = useState(customer?.type ?? 'brand');
  const [wechat, setWechat] = useState(customer?.wechat ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (customer) {
        await api.updateCustomer(customer.id, { name: name.trim(), type, wechat: wechat.trim() || null, note: note.trim() || null });
        toast(t('saved'));
      } else {
        await api.createCustomer({ name: name.trim(), type, wechat: wechat.trim() || null, note: note.trim() || null });
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
    <Modal title={customer ? t('editCustomer') : t('newCustomer')} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <Field label={t('customerName')}><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('customerType')}>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="brand">{t('typeBrand')}</option>
            <option value="agency">{t('typeAgency')}</option>
            <option value="platform">{t('typePlatform')}</option>
          </Select>
        </Field>
        <Field label={t('wechat')}><TextInput value={wechat} onChange={(e) => setWechat(e.target.value)} /></Field>
        <Field label={t('note')}><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} /></Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>{t('cancel')}</Btn>
          <Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn>
        </div>
      </form>
    </Modal>
  );
}
