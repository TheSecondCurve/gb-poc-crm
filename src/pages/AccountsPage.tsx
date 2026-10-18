// 账号页（S1）：版式照搬 gb-pmo —— 刊头 + 录入卡片 + 编辑部表格（状态/赛道/负责人筛选），
// 新建含买入成本，自动生成买入投入的事前提示
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Badge, Btn, Card, EmptyState, Field, Select, Spinner, TextInput } from '../components/ui';
import { PageMasthead } from '../components/editorial';
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
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('accountsKicker')}
        title={t('navAccounts')}
        description={t('accountsDesc')}
        aside={(
          <div className="md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">ACCOUNT INDEX</div>
            <div className="num mt-2 text-[12px] text-[var(--color-ink-soft)]">{accounts.length} {t('accountsUnit')}</div>
          </div>
        )}
      />

      <NewAccountCard onCreated={() => void load()} />

      <section className="editorial-enter-late">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{t('accountList')}</div>
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
              <option value="">{t('all')}{t('status')}</option>
              <option value="warming">{t('statusWarming')}</option>
              <option value="active">{t('statusActive')}</option>
              <option value="sealed">{t('statusSealed')}</option>
            </Select>
            <Select aria-label={t('categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select aria-label={t('ownerLabel')} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
              <option value="">{t('allOwners')}</option>
              {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </div>
        </div>
        {accounts.length === 0 ? (
          <div className="py-6"><EmptyState title={t('emptyDashboardTitle')} desc={t('autoPurchaseHint')} /></div>
        ) : (
          <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
            <table className="w-full min-w-[36rem] text-[13px]">
              <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
                <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                  <th>{t('accountName')}</th>
                  <th>{t('categoryLabel')}</th>
                  <th>{t('status')}</th>
                  <th>{t('ownerLabel')}</th>
                  <th>{t('purchasedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="cursor-pointer border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5" onClick={() => navigate(`accounts/${a.id}`)}>
                    <td><span className="display-type editorial-link text-[15px] font-semibold">{a.name}</span></td>
                    <td className="text-[var(--color-ink-soft)]">{a.category}</td>
                    <td><Badge tone={statusTone[a.status]}>{t(`status${a.status === 'warming' ? 'Warming' : a.status === 'active' ? 'Active' : 'Sealed'}`)}</Badge></td>
                    <td className="text-[var(--color-ink-soft)]">{boot?.users.find((u) => u.id === a.ownerId)?.displayName ?? t('ownerNone')}</td>
                    <td className="num whitespace-nowrap text-[var(--color-ink-soft)]">{fmtDate(a.purchasedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
        <p className="text-[12px] leading-5 text-[var(--color-ink-faint)]">{t('autoPurchaseHint')}</p>
        <div><Btn type="submit" variant="primary" loading={saving}>{t('create')}</Btn></div>
      </form>
    </Card>
  );
}
