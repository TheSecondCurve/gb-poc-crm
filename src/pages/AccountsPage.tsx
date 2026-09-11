// 账号页（S1）：列表（状态/赛道/负责人筛选）+ 新建（含买入成本，自动生成买入投入的事前提示）
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Badge, Btn, Card, EmptyState, Field, Select, Spinner, TextInput } from '../components/ui';
import type { Account } from '../types';

const statusTone = { warming: 'amber', active: 'green', sealed: 'red' } as const;

export function AccountsPage() {
  const { t, toast, boot } = useStore();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listAccounts({
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(ownerId ? { ownerId: Number(ownerId) } : {}),
      });
      setAccounts(res.accounts);
    } catch {
      toast(t('failed'), 'err');
    }
  }, [status, category, ownerId, toast, t]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => [...new Set((accounts ?? []).map((a) => a.category))], [accounts]);

  if (!accounts) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <NewAccountCard onCreated={() => void load()} />
      <Card
        title={t('accountList')}
        extra={
          <div className="flex gap-2">
            <Select aria-label={t('status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-1 text-xs">
              <option value="">{t('all')}{t('status')}</option>
              <option value="warming">{t('statusWarming')}</option>
              <option value="active">{t('statusActive')}</option>
              <option value="sealed">{t('statusSealed')}</option>
            </Select>
            <Select aria-label={t('categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto py-1 text-xs">
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select aria-label={t('ownerLabel')} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-auto py-1 text-xs">
              <option value="">{t('allOwners')}</option>
              {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </div>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState title={t('emptyDashboardTitle')} desc={t('autoPurchaseHint')} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="py-1">{t('accountName')}</th>
                <th className="py-1">{t('categoryLabel')}</th>
                <th className="py-1">{t('status')}</th>
                <th className="py-1">{t('ownerLabel')}</th>
                <th className="py-1">{t('purchasedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="cursor-pointer border-t border-black/5 hover:bg-black/[0.02]" onClick={() => navigate(`accounts/${a.id}`)}>
                  <td className="py-2">{a.name}</td>
                  <td className="py-2 text-ink-600">{a.category}</td>
                  <td className="py-2"><Badge tone={statusTone[a.status]}>{t(`status${a.status === 'warming' ? 'Warming' : a.status === 'active' ? 'Active' : 'Sealed'}`)}</Badge></td>
                  <td className="py-2 text-ink-600">{boot?.users.find((u) => u.id === a.ownerId)?.displayName ?? t('ownerNone')}</td>
                  <td className="py-2 text-ink-600 num">{fmtDate(a.purchasedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function NewAccountCard({ onCreated }: { onCreated: () => void }) {
  const { t, toast, boot, onApiError } = useStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [cost, setCost] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const purchaseCostCents = parseYuan(cost);
    const purchasedTs = dateInputToTs(purchasedAt);
    if (!name.trim() || !category.trim() || purchaseCostCents == null || purchasedTs == null) return;
    setSaving(true);
    try {
      await api.createAccount({
        name: name.trim(),
        category: category.trim(),
        purchasedAt: purchasedTs,
        purchaseCostCents,
        ...(ownerId ? { ownerId: Number(ownerId) } : {}),
      });
      toast(t('created'));
      setName(''); setCategory(''); setPurchasedAt(''); setCost(''); setOwnerId('');
      onCreated();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('newAccount')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label={t('accountName')}><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('categoryLabel')}><TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="美妆 / 穿搭 / 家居…" /></Field>
          <Field label={t('purchasedAt')}><TextInput type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} /></Field>
          <Field label={t('purchaseCost')}><TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="1500.00" /></Field>
          <Field label={t('ownerLabel')}>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{t('ownerNone')}</option>
              {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-ink-400">{t('autoPurchaseHint')}</p>
        <div><Btn type="submit" variant="primary" loading={saving}>{t('create')}</Btn></div>
      </form>
    </Card>
  );
}
