// 投入列表页（S2）：版式照搬 gb-pmo —— 刊头 + 录入卡片 + 编辑部流水表（类型筛选）
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, Field, Select, Spinner, TextInput } from '../components/ui';
import { PageMasthead } from '../components/editorial';
import type { Account, AccountInvestment } from '../types';

export function InvestmentsPage() {
  const { t, onApiError } = useStore();
  const [investments, setInvestments] = useState<AccountInvestment[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    try {
      const [inv, acc] = await Promise.all([
        api.listInvestments(type ? { type } : {}),
        api.listAccounts(),
      ]);
      setInvestments(inv.investments);
      setAccounts(acc.accounts);
    } catch (err) {
      onApiError(err);
    }
  }, [type, onApiError]);

  useEffect(() => { void load(); }, [load]);

  if (!investments) return <Spinner />;

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('invKicker')}
        title={t('navInvestments')}
        description={t('invDesc')}
        aside={(
          <div className="md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">CASH OUT</div>
            <div className="num mt-2 text-[12px] text-[var(--color-ink-soft)]">{investments.length} {t('recordsUnit')}</div>
          </div>
        )}
        actions={(
          <Select aria-label={t('invType')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
            <option value="">{t('all')}{t('invType')}</option>
            <option value="purchase">{t('invPurchase')}</option>
            <option value="traffic">{t('invTraffic')}</option>
          </Select>
        )}
      />

      <NewInvestmentCard accounts={accounts} onCreated={() => void load()} />

      <section className="editorial-enter-late">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{t('investmentList')}</div>
        </div>
        <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
              <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                <th>{t('spentAt')}</th>
                <th>{t('account')}</th>
                <th>{t('invType')}</th>
                <th className="text-right">{t('amount')}</th>
                <th>{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5">
                  <td className="num whitespace-nowrap">{fmtDate(inv.spentAt)}</td>
                  <td><span className="display-type text-[15px] font-semibold">{accountName(inv.accountId)}</span></td>
                  <td><Badge tone={inv.type === 'purchase' ? 'blue' : 'amber'}>{inv.type === 'purchase' ? t('invPurchase') : t('invTraffic')}</Badge></td>
                  <td className="text-right"><Amount cents={inv.amountCents} /></td>
                  <td className="text-[var(--color-ink-soft)]">{inv.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NewInvestmentCard({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const { t, toast, onApiError } = useStore();
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountCents = parseYuan(amount);
    const ts = dateInputToTs(spentAt);
    if (!accountId || amountCents == null || ts == null) return;
    setSaving(true);
    try {
      await api.createInvestment({ accountId: Number(accountId), type: 'traffic', amountCents, spentAt: ts, note: note.trim() || null });
      toast(t('created'));
      setAmount(''); setSpentAt(''); setNote('');
      onCreated();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('newInvestment')}>
      <form onSubmit={(e) => void submit(e)} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label={t('account')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label={t('spentAt')}><TextInput type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} required /></Field>
        <Field label={t('amount')}><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label={t('note')}><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} /></Field>
        <div className="flex items-end"><Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn></div>
      </form>
    </Card>
  );
}
