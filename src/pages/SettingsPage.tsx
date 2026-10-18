// 设置页即控制台：版式照搬 gb-pmo —— 刊头 + 分区卡片（通用阈值 / 成员管理 admin / 令牌管理 / 审计日志 admin），每区独立保存
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtCents, fmtDateTime } from '../format';
import { Badge, Btn, Card, ConfirmModal, Field, Select, TextInput } from '../components/ui';
import { PageMasthead } from '../components/editorial';
import type { AuditEntry, PatToken, User } from '../types';

export function SettingsPage() {
  const { t, user } = useStore();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="space-y-8 md:space-y-10">
      <PageMasthead
        kicker={t('settingsKicker')}
        title={t('navSettings')}
        description={t('settingsDesc')}
        aside={(
          <div className="md:border-l md:border-[var(--color-line-strong)] md:pl-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-faint)]">CONSOLE</div>
            <div className="num mt-2 text-[12px] text-[var(--color-ink-soft)]">@{user?.username}</div>
          </div>
        )}
      />
      <div className="flex max-w-4xl flex-col gap-6">
        <GeneralSection />
        {isAdmin && <MembersSection />}
        <TokensSection />
        {isAdmin && <AuditSection />}
        {isAdmin && <DangerZoneSection />}
      </div>
    </div>
  );
}

// S10/S11 危险区：仅 admin 渲染。初始化演示数据 + 清除全部业务数据（确认词门禁）
function DangerZoneSection() {
  const { t, toast, refreshBoot, onApiError } = useStore();
  const [seedOpen, setSeedOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const seed = async () => {
    setBusy(true);
    try {
      const { stats } = await api.seedDemo();
      setSeedOpen(false);
      toast(t('seedDemoDone', {
        accounts: stats.accounts, customers: stats.customers, orders: stats.orders,
        from: stats.fromMonth, to: stats.toMonth, revenue: fmtCents(stats.totalRevenueCents),
      }));
      await refreshBoot();
    } catch (err) {
      onApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    setBusy(true);
    try {
      await api.wipeData();
      setWipeOpen(false);
      toast(t('wipeDataDone'));
      await refreshBoot();
    } catch (err) {
      onApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('dangerZone')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] leading-6 text-[var(--color-ink-soft)]">{t('seedDemoDesc')}</p>
          <Btn variant="danger" className="shrink-0" onClick={() => setSeedOpen(true)}>{t('seedDemo')}</Btn>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[var(--color-line)] pt-3">
          <p className="text-[13px] leading-6 text-[var(--color-ink-soft)]">{t('wipeDataDesc')}</p>
          <Btn variant="danger" className="shrink-0" onClick={() => setWipeOpen(true)}>{t('wipeData')}</Btn>
        </div>
      </div>
      {seedOpen && (
        <ConfirmModal
          title={t('seedDemoConfirmTitle')}
          desc={t('seedDemoConfirmDesc')}
          confirmLabel={t('seedDemo')}
          onConfirm={() => void seed()}
          onClose={() => setSeedOpen(false)}
          loading={busy}
        />
      )}
      {wipeOpen && (
        <ConfirmModal
          title={t('wipeDataConfirmTitle')}
          desc={t('wipeDataConfirmDesc')}
          confirmLabel={t('wipeData')}
          confirmWord={t('wipeDataConfirmWord')}
          onConfirm={() => void wipe()}
          onClose={() => setWipeOpen(false)}
          loading={busy}
        />
      )}
    </Card>
  );
}

function GeneralSection() {
  const { t, toast, boot, refreshBoot, onApiError } = useStore();
  const [idle, setIdle] = useState(boot?.settings.idle_threshold_days ?? '30');
  const [repurchase, setRepurchase] = useState(boot?.settings.repurchase_threshold_days ?? '30');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSetting('idle_threshold_days', idle);
      await api.updateSetting('repurchase_threshold_days', repurchase);
      toast(t('saved'));
      await refreshBoot();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={`${t('settingsGeneral')} · ${t('thresholds')}`}>
      <form onSubmit={(e) => void save(e)} className="grid grid-cols-2 gap-3">
        <Field label={t('idleThreshold')}><TextInput inputMode="numeric" value={idle} onChange={(e) => setIdle(e.target.value)} /></Field>
        <Field label={t('repurchaseThreshold')}><TextInput inputMode="numeric" value={repurchase} onChange={(e) => setRepurchase(e.target.value)} /></Field>
        <div className="col-span-2"><Btn type="submit" variant="primary" loading={saving}>{t('save')}</Btn></div>
      </form>
    </Card>
  );
}

function MembersSection() {
  const { t, toast, refreshBoot, onApiError } = useStore();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (err) {
      onApiError(err);
    }
  }, [onApiError]);

  useEffect(() => { void load(); }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createUser({ username: username.trim(), displayName: displayName.trim(), password, role });
      toast(t('created'));
      setUsername(''); setDisplayName(''); setPassword('');
      await load();
      await refreshBoot();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleDisable = async (u: User) => {
    try {
      await api.updateUser(u.id, { disable: !u.disabledAt });
      toast(t('saved'));
      await load();
      await refreshBoot();
    } catch (err) {
      onApiError(err);
    }
  };

  return (
    <Card title={t('members')}>
      <table className="mb-3 w-full text-[13px]">
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[var(--color-line)] last:border-0">
              <td className="py-2.5">{u.displayName} <span className="text-[11px] text-[var(--color-ink-faint)]">@{u.username}</span></td>
              <td className="py-2.5"><Badge tone={u.role === 'admin' ? 'blue' : 'gray'}>{u.role === 'admin' ? t('roleAdmin') : t('roleMember')}</Badge></td>
              <td className="py-2.5">{u.disabledAt && <Badge tone="red">{t('disabledTag')}</Badge>}</td>
              <td className="py-2.5 text-right">
                <Btn onClick={() => void toggleDisable(u)}>{u.disabledAt ? t('enable') : t('disable')}</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={(e) => void create(e)} className="grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4 md:grid-cols-5">
        <Field label={t('username')}><TextInput value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
        <Field label={t('displayName')}><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></Field>
        <Field label={t('password')}><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Field label={t('role')}>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">{t('roleMember')}</option>
            <option value="admin">{t('roleAdmin')}</option>
          </Select>
        </Field>
        <div className="flex items-end"><Btn type="submit" variant="primary" loading={saving}>{t('newMember')}</Btn></div>
      </form>
    </Card>
  );
}

function TokensSection() {
  const { t, toast, user, onApiError } = useStore();
  const [tokens, setTokens] = useState<PatToken[]>([]);
  const [password, setPassword] = useState('');
  const [scope, setScope] = useState('read');
  const [issued, setIssued] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<PatToken | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listTokens();
      setTokens(res.tokens);
    } catch (err) {
      onApiError(err);
    }
  }, [onApiError]);

  useEffect(() => { void load(); }, [load]);

  const issue = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await api.issueToken(user.username, password, scope);
      setIssued(res.token);
      setPassword('');
      toast(t('created'));
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const doRevoke = async () => {
    if (!revoking) return;
    setActing(true);
    try {
      await api.revokeToken(revoking.id);
      toast(t('deleted'));
      setRevoking(null);
      await load();
    } catch (err) {
      onApiError(err);
    } finally {
      setActing(false);
    }
  };

  return (
    <Card title={t('tokens')}>
      {issued && (
        <div className="mb-3 rounded-[3px] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3">
          <p className="mb-1 text-[11px] leading-5 text-[var(--color-warn)]">{t('tokenIssuedHint')}</p>
          <code className="num block break-all rounded-[3px] bg-[var(--color-card)] px-2 py-1 text-[12px]">{issued}</code>
        </div>
      )}
      <table className="mb-3 w-full text-[13px]">
        <tbody>
          {tokens.map((tk) => (
            <tr key={tk.id} className="border-b border-[var(--color-line)] last:border-0">
              <td className="py-2.5"><code className="num text-[12px]">xhp_{tk.prefix}…</code></td>
              <td className="py-2.5"><Badge tone={tk.scope === 'write' ? 'amber' : 'gray'}>{tk.scope === 'write' ? t('scopeWrite') : t('scopeRead')}</Badge></td>
              <td className="num py-2.5 text-[11px] text-[var(--color-ink-faint)]">{t('expiresAt')} {fmtDateTime(tk.expiresAt)}</td>
              <td className="py-2.5">{tk.revokedAt && <Badge tone="red">{t('revokedTag')}</Badge>}</td>
              <td className="py-2.5 text-right">
                {!tk.revokedAt && <Btn onClick={() => setRevoking(tk)}>{t('revoke')}</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={(e) => void issue(e)} className="grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4 md:grid-cols-3">
        <Field label={t('password')}>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label={t('tokenScope')}>
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="read">{t('scopeRead')}</option>
            <option value="write">{t('scopeWrite')}</option>
          </Select>
        </Field>
        <div className="flex items-end"><Btn type="submit" variant="primary" loading={saving}>{t('issueToken')}</Btn></div>
      </form>
      {revoking && (
        <ConfirmModal
          title={t('revoke')}
          desc={t('revokeConfirm', { prefix: revoking.prefix })}
          confirmLabel={t('revoke')}
          onConfirm={() => void doRevoke()}
          onClose={() => setRevoking(null)}
          loading={acting}
        />
      )}
    </Card>
  );
}

function AuditSection() {
  const { t, onApiError } = useStore();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api.auditLog().then((r) => setEntries(r.entries)).catch(onApiError);
  }, [onApiError]);

  return (
    <Card title={`${t('auditLog')}（${t('adminOnly')}）`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-[13px]">
          <thead className="text-left text-[10px] font-medium tracking-[0.08em] text-[var(--color-ink-soft)]">
            <tr className="border-b border-[var(--color-line)] [&>th]:whitespace-nowrap [&>th]:py-2">
              <th>{t('auditTime')}</th>
              <th>{t('auditOperator')}</th>
              <th>{t('auditAction')}</th>
              <th>{t('auditTarget')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="num py-2 text-[12px]">{fmtDateTime(e.createdAt)}</td>
                <td className="py-2">{e.username ?? '—'}</td>
                <td className="py-2"><code className="text-[12px]">{e.action}</code></td>
                <td className="py-2 text-[12px] text-[var(--color-ink-soft)]">{e.targetType ? `${e.targetType}#${e.targetId ?? ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
