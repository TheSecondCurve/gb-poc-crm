// 运营费用页（S7）：版式照搬 gb-pmo —— 刊头 + 录入卡片 + 编辑部流水表 + 多选批量删除浮动条
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, ConfirmModal, Field, Select, Spinner, TextInput } from '../components/ui';
import { PageMasthead } from '../components/editorial';
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
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('expKicker')}
        title={t('navExpenses')}
        description={t('expDesc')}
        aside={(
          <div className="md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">OVERHEAD</div>
            <div className="num mt-2 text-[12px] text-[var(--color-ink-soft)]">{expenses.length} {t('recordsUnit')}</div>
          </div>
        )}
        actions={(
          <Select aria-label={t('expenseCategory')} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto! rounded-full py-1.5 text-[12px]">
            <option value="">{t('all')}{t('expenseCategory')}</option>
            <option value="salary">{t('expSalary')}</option>
            <option value="office">{t('expOffice')}</option>
            <option value="other">{t('expOther')}</option>
          </Select>
        )}
      />

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

      <section className="editorial-enter-late">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-line)] py-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{t('expenseList')}</div>
        </div>
        <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
          <table className="w-full min-w-[32rem] text-[13px]">
            <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
              <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                <th className="w-8" />
                <th>{t('spentAt')}</th>
                <th>{t('expenseCategory')}</th>
                <th className="text-right">{t('amount')}</th>
                <th>{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5">
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`select-${e.id}`}
                      checked={selected.has(e.id)}
                      onChange={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                        return next;
                      })}
                      className="accent-[var(--color-brand)]"
                    />
                  </td>
                  <td className="num whitespace-nowrap">{fmtDate(e.spentAt)}</td>
                  <td><Badge tone="gray">{t(catLabel[e.category])}</Badge></td>
                  <td className="text-right"><Amount cents={e.amountCents} /></td>
                  <td className="text-[var(--color-ink-soft)]">{e.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected.size > 0 && (
        <div className="pop-in fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--color-ink)] bg-[var(--color-ink)] px-5 py-2.5 text-[13px] text-[var(--color-card)] shadow-[var(--shadow-float)]">
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
