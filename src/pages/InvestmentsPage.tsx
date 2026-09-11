// 投入列表页（S2）：全部账号的买入/投流流水，类型筛选 + 独立录入
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, Field, Select, Spinner, TextInput } from '../components/ui';
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
    <div className="flex flex-col gap-4">
      <NewInvestmentCard accounts={accounts} onCreated={() => void load()} />
      <Card
        title={t('investmentList')}
        extra={
          <Select aria-label={t('invType')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto py-1 text-xs">
            <option value="">{t('all')}{t('invType')}</option>
            <option value="purchase">{t('invPurchase')}</option>
            <option value="traffic">{t('invTraffic')}</option>
          </Select>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400">
              <th className="py-1">{t('spentAt')}</th>
              <th className="py-1">{t('account')}</th>
              <th className="py-1">{t('invType')}</th>
              <th className="py-1 text-right">{t('amount')}</th>
              <th className="py-1">{t('note')}</th>
            </tr>
          </thead>
          <tbody>
            {investments.map((inv) => (
              <tr key={inv.id} className="border-t border-black/5">
                <td className="py-1.5 num">{fmtDate(inv.spentAt)}</td>
                <td className="py-1.5">{accountName(inv.accountId)}</td>
                <td className="py-1.5"><Badge tone={inv.type === 'purchase' ? 'blue' : 'amber'}>{inv.type === 'purchase' ? t('invPurchase') : t('invTraffic')}</Badge></td>
                <td className="py-1.5 text-right"><Amount cents={inv.amountCents} /></td>
                <td className="py-1.5 text-ink-600">{inv.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
