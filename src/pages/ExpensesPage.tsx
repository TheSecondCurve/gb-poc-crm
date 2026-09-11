// 运营费用页（S7）：录入（工资/办公/其他）+ 列表 + 多选批量删除
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, ConfirmModal, Field, Select, Spinner, TextInput } from '../components/ui';
import type { OperatingExpense } from '../types';

const catLabel = { salary: 'expSalary', office: 'expOffice', other: 'expOther' } as const;

export function ExpensesPage() {
  const { t, toast, onApiError } = useStore();
  const [expenses, setExpenses] = useState<OperatingExpense[] | null>(null);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [acting, setActing] = useState(false);

  // 录入表单
  const [cat, setCat] = useState('salary');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listExpenses(category ? { category } : {});
      setExpenses(res.expenses);
      setSelected(new Set());
    } catch (err) {
      onApiError(err);
    }
  }, [category, onApiError]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountCents = parseYuan(amount);
    const ts = dateInputToTs(spentAt);
    if (amountCents == null || ts == null) return;
    setSaving(true);
    try {
      await api.createExpense({ category: cat, amountCents, spentAt: ts, note: note.trim() || null });
      toast(t('created'));
      setAmount(''); setSpentAt(''); setNote('');
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const doBatchDelete = async () => {
    setActing(true);
    try {
      for (const id of selected) await api.deleteExpense(id);
      toast(t('batchDeleted', { n: selected.size }));
      setBatchConfirm(false);
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setActing(false);
    }
  };

  if (!expenses) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('newExpense')}>
        <form onSubmit={(e) => void submit(e)} className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label={t('expenseCategory')}>
            <Select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="salary">{t('expSalary')}</option>
              <option value="office">{t('expOffice')}</option>
              <option value="other">{t('expOther')}</option>
            </Select>
          </Field>
          <Field label={t('spentAt')}><TextInput type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} required /></Field>
          <Field label={t('amount')}><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          <Field label={t('note')}><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} /></Field>
          <div className="flex items-end"><Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn></div>
        </form>
      </Card>

      <Card
        title={t('expenseList')}
        extra={
          <Select aria-label={t('expenseCategory')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto py-1 text-xs">
            <option value="">{t('all')}{t('expenseCategory')}</option>
            <option value="salary">{t('expSalary')}</option>
            <option value="office">{t('expOffice')}</option>
            <option value="other">{t('expOther')}</option>
          </Select>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400">
              <th className="w-8 py-1" />
              <th className="py-1">{t('spentAt')}</th>
              <th className="py-1">{t('expenseCategory')}</th>
              <th className="py-1 text-right">{t('amount')}</th>
              <th className="py-1">{t('note')}</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-black/5">
                <td className="py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`select-${e.id}`}
                    checked={selected.has(e.id)}
                    onChange={() => setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                      return next;
                    })}
                  />
                </td>
                <td className="py-1.5 num">{fmtDate(e.spentAt)}</td>
                <td className="py-1.5"><Badge tone="gray">{t(catLabel[e.category])}</Badge></td>
                <td className="py-1.5 text-right"><Amount cents={e.amountCents} /></td>
                <td className="py-1.5 text-ink-600">{e.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected.size > 0 && (
        <div className="anim-pop fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <span>{t('selected', { n: selected.size })}</span>
          <Btn variant="danger" onClick={() => setBatchConfirm(true)}>{t('batchDelete')}</Btn>
        </div>
      )}
      {batchConfirm && (
        <ConfirmModal
          title={t('batchDelete')}
          desc={t('deleteExpensesDesc', { n: selected.size })}
          confirmLabel={t('delete')}
          onConfirm={() => void doBatchDelete()}
          onClose={() => setBatchConfirm(false)}
          loading={acting}
        />
      )}
    </div>
  );
}
