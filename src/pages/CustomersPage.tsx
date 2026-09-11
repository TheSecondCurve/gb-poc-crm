// 客户页（S5）：列表（类型/累计金额/最近合作）+ 新建/编辑；详情见 CustomerDetailPage
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate, fmtDateTime } from '../format';
import { Amount, Badge, Btn, Card, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
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
    <Card
      title={t('customerList')}
      extra={
        <div className="flex gap-2">
          <Select aria-label={t('customerType')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto py-1 text-xs">
            <option value="">{t('allTypes')}</option>
            <option value="brand">{t('typeBrand')}</option>
            <option value="agency">{t('typeAgency')}</option>
            <option value="platform">{t('typePlatform')}</option>
          </Select>
          <Btn variant="primary" onClick={() => setEditing('new')}>{t('newCustomer')}</Btn>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-400">
            <th className="py-1">{t('customerName')}</th>
            <th className="py-1">{t('customerType')}</th>
            <th className="py-1">{t('wechat')}</th>
            <th className="py-1 text-right">{t('totalCentsLabel')}</th>
            <th className="py-1">{t('lastOrderAt')}</th>
            <th className="py-1">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-t border-black/5">
              <td className="cursor-pointer py-2 hover:text-brand-600" onClick={() => navigate(`customers/${c.id}`)}>{c.name}</td>
              <td className="py-2"><Badge tone={typeTone[c.type]}>{t(typeLabel[c.type])}</Badge></td>
              <td className="py-2 text-ink-600">{c.wechat ?? '—'}</td>
              <td className="py-2 text-right"><Amount cents={c.totals.totalCents} /></td>
              <td className="py-2 text-ink-600 num" title={fmtDateTime(c.totals.lastOrderAt)}>{fmtDate(c.totals.lastOrderAt)}</td>
              <td className="py-2"><Btn onClick={() => setEditing(c)}>{t('edit')}</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <CustomerModal
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </Card>
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
