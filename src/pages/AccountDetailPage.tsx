// 账号详情（S1/S8/S9）：盈亏小卡、估值参考及计算依据、投入记录（含记投流）、广告订单、
// 状态变更（sealed 需 Modal 二次确认写明影响）、归属负责人变更、软删
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { navigate } from '../router';
import { fmtCents, fmtDate, parseYuan, dateInputToTs } from '../format';
import { Amount, Badge, Btn, Card, ConfirmModal, Field, Select, Spinner, TextInput } from '../components/ui';
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Btn onClick={() => navigate('accounts')} aria-label={t('back')}><ArrowLeft size={14} />{t('back')}</Btn>
        <h1 className="text-base font-bold text-ink-900">{account.name}</h1>
        <Badge tone={statusTone[account.status]}>{t(statusLabel[account.status])}</Badge>
      </div>

      {/* 盈亏小卡 + 估值（S9） */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('totalInvested')} cents={account.totals.totalInvestedCents} />
        <Stat label={t('totalRevenue')} cents={account.totals.totalRevenueCents} />
        <Stat label={t('netPnl')} cents={account.totals.totalRevenueCents - account.totals.totalInvestedCents} signed />
        <Card className="p-3">
          <div className="text-xs text-ink-400">{t('valuation')}</div>
          <Amount cents={valuation?.valuationCents ?? 0} className="text-lg font-semibold" />
          {valuation && (
            <div className="mt-1 text-xs text-ink-400">
              <div>{t('valuationDesc', { months: valuation.basis.months, multiplier: valuation.basis.multiplier })}</div>
              <div title={t('valuationBasis')}>
                {t('valuationWindow')}: {fmtDate(valuation.basis.windowStart)} ~ {fmtDate(valuation.basis.windowEnd)}；{t('monthlyAvg')} ¥{fmtCents(valuation.basis.monthlyAvgCents)}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 信息与操作 */}
      <Card title={t('accountDetail')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Info label={t('categoryLabel')} value={account.category} />
          <Info label={t('purchasedAt')} value={fmtDate(account.purchasedAt)} />
          <div>
            <div className="text-xs text-ink-400">{t('ownerLabel')}</div>
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
              className="mt-1 w-auto py-1 text-sm"
            >
              <option value="">{t('ownerNone')}</option>
              {(boot?.users ?? []).filter((u) => !u.disabledAt).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </div>
          <div>
            <div className="text-xs text-ink-400">{t('actions')}</div>
            <div className="mt-1 flex gap-2">
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
      <Card title={t('investmentsTab')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400">
              <th className="py-1">{t('spentAt')}</th><th className="py-1">{t('invType')}</th>
              <th className="py-1 text-right">{t('amount')}</th><th className="py-1">{t('note')}</th>
            </tr>
          </thead>
          <tbody>
            {account.investments.map((inv) => (
              <tr key={inv.id} className="border-t border-black/5">
                <td className="py-1.5 num">{fmtDate(inv.spentAt)}</td>
                <td className="py-1.5"><Badge tone={inv.type === 'purchase' ? 'blue' : 'amber'}>{inv.type === 'purchase' ? t('invPurchase') : t('invTraffic')}</Badge></td>
                <td className="py-1.5 text-right"><Amount cents={inv.amountCents} /></td>
                <td className="py-1.5 text-ink-600">{inv.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 广告订单 */}
      <Card title={t('ordersTab')}>
        {account.orders.length === 0 ? <p className="text-sm text-ink-400">{t('neverOrdered')}</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="py-1">{t('publishedAt')}</th><th className="py-1">{t('brand')}</th>
                <th className="py-1">{t('product')}</th><th className="py-1">{t('channel')}</th>
                <th className="py-1 text-right">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {account.orders.map((o) => (
                <tr key={o.id} className="border-t border-black/5">
                  <td className="py-1.5 num">{fmtDate(o.publishedAt)}</td>
                  <td className="py-1.5">{o.brand ?? '—'}</td>
                  <td className="py-1.5 text-ink-600">{o.product ?? '—'}</td>
                  <td className="py-1.5 text-ink-600">{o.channel === 'private' ? t('channelPrivate') : t('channelPlatform')}</td>
                  <td className="py-1.5 text-right"><Amount cents={o.amountCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

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

function Stat({ label, cents, signed = false }: { label: string; cents: number; signed?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-400">{label}</div>
      <Amount cents={cents} signed={signed} className="text-lg font-semibold" />
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
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
