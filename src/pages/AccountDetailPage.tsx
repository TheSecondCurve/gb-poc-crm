// 账号详情（S1/S8/S9）：版式照搬 gb-pmo —— 刊头（账号档案）+ 大数字盈亏版 + 估值依据 +
// 投入记录（含记投流）+ 广告订单；状态变更（sealed 需 Modal 二次确认）、归属负责人变更、软删
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtCents, fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, ConfirmModal, Field, Select, Spinner, TextInput } from '../components/ui';
import { PageMasthead, SectionHeading } from '../components/editorial';
import type { AccountDetail, AccountValuationRow } from '../types';

const statusLabel = { warming: 'statusWarming', active: 'statusActive', sealed: 'statusSealed' } as const;
const statusTone = { warming: 'amber', active: 'green', sealed: 'red' } as const;

export function AccountDetailPage({ id }: { id: number }) {
  const { t, toast, boot, onApiError } = useStore();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [valuation, setValuation] = useState<AccountValuationRow | null>(null);
  const [sealConfirm, setSealConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, val] = await Promise.all([
        api.getAccount(id),
        api.queryMetric<{ rows: AccountValuationRow[] }>('account_valuation', { accountId: id }),
      ]);
      setAccount(detail.account);
      setValuation(val.result.rows[0] ?? null);
    } catch (err) {
      onApiError(err);
    }
  }, [id, onApiError]);

  useEffect(() => { void load(); }, [load]);

  if (!account) return <Spinner />;

  const netCents = account.totals.totalRevenueCents - account.totals.totalInvestedCents;

  const doSeal = async () => {
    setActing(true);
    try {
      await api.updateAccount(id, { status: 'sealed' });
      toast(t('saved'));
      setSealConfirm(false);
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    setActing(true);
    try {
      await api.deleteAccount(id);
      toast(t('deleted'));
      navigate('accounts');
    } catch (err) {
      onApiError(err);
      setActing(false);
    }
  };

  return (
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('accountFileKicker')}
        title={account.name}
        description={<>{account.category} · {t('purchasedAt')} {fmtDate(account.purchasedAt)} · {boot?.users.find((u) => u.id === account.ownerId)?.displayName ?? t('ownerNone')}</>}
        aside={<Badge tone={statusTone[account.status]}>{t(statusLabel[account.status])}</Badge>}
        actions={(
          <Btn onClick={() => navigate('accounts')} aria-label={t('back')}><ArrowLeft aria-hidden="true" size={14} />{t('back')}</Btn>
        )}
      />

      {/* 盈亏大数字版 + 估值（S9） */}
      <section data-testid="pnl-board" className="editorial-enter-late grid overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] md:grid-cols-4">
        <div className="flex min-h-[180px] flex-col justify-between border-b border-[var(--color-line)] p-6 md:col-span-2 md:border-r">
          <div className="flex items-start justify-between gap-4">
            <div className="editorial-kicker">{t('netPnl')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">01</span>
          </div>
          <div className={`num my-5 text-[56px] font-light leading-[0.85] tracking-[-0.06em] ${netCents < 0 ? 'text-[var(--color-bad)]' : 'text-[var(--color-ink)]'}`}>
            <span className="text-[28px] tracking-normal text-[var(--color-ink-faint)]">¥</span>{fmtCents(netCents)}
          </div>
          <div className="flex gap-6 border-t border-[var(--color-line)] pt-4 text-[12px] text-[var(--color-ink-soft)]">
            <span>{t('totalInvested')} <Amount cents={account.totals.totalInvestedCents} /></span>
            <span>{t('totalRevenue')} <Amount cents={account.totals.totalRevenueCents} /></span>
          </div>
        </div>
        <div className="border-b border-[var(--color-line)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('totalInvested')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">02</span>
          </div>
          <div className="num mt-5 text-[30px] font-light leading-none tracking-[-0.05em]"><Amount cents={account.totals.totalInvestedCents} /></div>
          <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">INVESTED</div>
        </div>
        <div className="border-b border-[var(--color-line)] p-6 md:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('totalRevenue')}</div>
            <span className="num text-[10px] text-[var(--color-ink-faint)]">03</span>
          </div>
          <div className="num mt-5 text-[30px] font-light leading-none tracking-[-0.05em]"><Amount cents={account.totals.totalRevenueCents} /></div>
          <div className="mt-4 text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)]">REVENUE</div>
        </div>
        <div className="p-6 md:col-span-4">
          <div className="flex items-start justify-between gap-4">
            <div className="text-[11px] text-[var(--color-ink-soft)]">{t('valuation')}</div>
            <div className="text-[9px] tracking-[0.14em] text-[var(--color-ink-faint)]">VALUATION</div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
            <div className="num text-[34px] font-light leading-none tracking-[-0.05em]">
              <Amount cents={valuation?.valuationCents ?? 0} />
            </div>
            {valuation && (
              <div className="text-[12px] leading-5 text-[var(--color-ink-soft)]">
                <div>{t('valuationDesc', { months: valuation.basis.months, multiplier: valuation.basis.multiplier })}</div>
                <div title={t('valuationBasis')}>
                  {t('valuationWindow')}: {fmtDate(valuation.basis.windowStart)} ~ {fmtDate(valuation.basis.windowEnd)}；{t('monthlyAvg')} ¥{fmtCents(valuation.basis.monthlyAvgCents)}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 信息与操作 */}
      <Card title={t('accountDetail')}>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Info label={t('categoryLabel')} value={account.category} />
          <Info label={t('purchasedAt')} value={fmtDate(account.purchasedAt)} />
          <div>
            <div className="mb-1.5 text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{t('ownerLabel')}</div>
            <Select
              aria-label={t('ownerLabel')}
              value={account.ownerId ?? ''}
              onChange={async (e) => {
                try {
                  await api.updateAccount(id, { ownerId: e.target.value ? Number(e.target.value) : null });
                  toast(t('saved'));
                  await load();
                } catch (err) { onApiError(err); }
              }}
              className="w-auto! py-1.5 text-[13px]"
            >
              <option value="">{t('ownerNone')}</option>
              {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{t('actions')}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {account.status !== 'sealed' ? (
                <Btn variant="danger" onClick={() => setSealConfirm(true)}>{t('markSealed')}</Btn>
              ) : (
                <Btn onClick={async () => {
                  try {
                    await api.updateAccount(id, { status: 'active' });
                    toast(t('saved'));
                    await load();
                  } catch (err) { onApiError(err); }
                }}>{t('markActive')}</Btn>
              )}
              <Btn onClick={() => setDeleteConfirm(true)}>{t('deleteAccount')}</Btn>
            </div>
          </div>
        </div>
      </Card>

      <AddTrafficCard accountId={id} onCreated={() => void load()} />

      {/* 投入记录 */}
      <section className="editorial-enter-late">
        <SectionHeading index="01" title={t('investmentsTab')} />
        <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
          <table className="w-full min-w-[32rem] text-[13px]">
            <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
              <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                <th>{t('spentAt')}</th><th>{t('invType')}</th>
                <th className="text-right">{t('amount')}</th><th>{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {account.investments.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5">
                  <td className="num whitespace-nowrap">{fmtDate(inv.spentAt)}</td>
                  <td><Badge tone={inv.type === 'purchase' ? 'blue' : 'amber'}>{inv.type === 'purchase' ? t('invPurchase') : t('invTraffic')}</Badge></td>
                  <td className="text-right"><Amount cents={inv.amountCents} /></td>
                  <td className="text-[var(--color-ink-soft)]">{inv.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 广告订单 */}
      <section className="editorial-enter-late">
        <SectionHeading index="02" title={t('ordersTab')} />
        {account.orders.length === 0 ? (
          <div className="border-b border-[var(--color-line)] py-12 text-center text-[13px] text-[var(--color-ink-soft)]">{t('neverOrdered')}</div>
        ) : (
          <div className="overflow-x-auto border-b border-[var(--color-line-strong)] bg-[var(--color-card)]/45">
            <table className="w-full min-w-[40rem] text-[13px]">
              <thead className="bg-[var(--color-panel)]/45 text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
                <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                  <th>{t('publishedAt')}</th><th>{t('brand')}</th>
                  <th>{t('product')}</th><th>{t('channel')}</th>
                  <th className="text-right">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {account.orders.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-panel)]/60 [&>td]:px-4 [&>td]:py-3.5">
                    <td className="num whitespace-nowrap">{fmtDate(o.publishedAt)}</td>
                    <td>{o.brand ?? '—'}</td>
                    <td className="text-[var(--color-ink-soft)]">{o.product ?? '—'}</td>
                    <td className="text-[var(--color-ink-soft)]">{o.channel === 'private' ? t('channelPrivate') : t('channelPlatform')}</td>
                    <td className="text-right"><Amount cents={o.amountCents} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sealConfirm && (
        <ConfirmModal
          title={t('sealConfirmTitle')}
          desc={t('sealConfirmDesc', { name: account.name })}
          confirmLabel={t('markSealed')}
          onConfirm={() => void doSeal()}
          onClose={() => setSealConfirm(false)}
          loading={acting}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title={t('deleteAccount')}
          desc={t('deleteAccountDesc', { name: account.name })}
          confirmLabel={t('delete')}
          onConfirm={() => void doDelete()}
          onClose={() => setDeleteConfirm(false)}
          loading={acting}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{label}</div>
      <div className="text-[13px]">{value}</div>
    </div>
  );
}

function AddTrafficCard({ accountId, onCreated }: { accountId: number; onCreated: () => void }) {
  const { t, toast, onApiError } = useStore();
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountCents = parseYuan(amount);
    const ts = dateInputToTs(spentAt);
    if (amountCents == null || ts == null) return;
    setSaving(true);
    try {
      await api.createInvestment({ accountId, type: 'traffic', amountCents, spentAt: ts, note: note.trim() || null });
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
    <Card title={t('addTraffic')}>
      <form onSubmit={(e) => void submit(e)} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label={t('spentAt')}><TextInput type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} /></Field>
        <Field label={t('amount')}><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="300.00" /></Field>
        <Field label={t('note')}><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} /></Field>
        <div className="flex items-end"><Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn></div>
      </form>
    </Card>
  );
}
