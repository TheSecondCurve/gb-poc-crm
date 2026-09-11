// 设置页即控制台：分区卡片（通用阈值 / 成员管理 admin / 令牌管理 / 审计日志 admin），每区独立保存
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { Badge, Btn, Card, ConfirmModal, Field, Select, TextInput } from '../components/ui';
import type { AuditEntry, PatToken, User } from '../types';

export function SettingsPage() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <GeneralSection />
      {isAdmin && <MembersSection />}
      <TokensSection />
      {isAdmin && <AuditSection />}
    </div>
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
      <table className="mb-3 w-full text-sm">
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-black/5 first:border-0">
              <td className="py-1.5">{u.displayName} <span className="text-xs text-ink-400">@{u.username}</span></td>
              <td className="py-1.5"><Badge tone={u.role === 'admin' ? 'blue' : 'gray'}>{u.role === 'admin' ? t('roleAdmin') : t('roleMember')}</Badge></td>
              <td className="py-1.5">{u.disabledAt && <Badge tone="red">{t('disabledTag')}</Badge>}</td>
              <td className="py-1.5 text-right">
                <Btn onClick={() => void toggleDisable(u)}>{u.disabledAt ? t('enable') : t('disable')}</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={(e) => void create(e)} className="grid grid-cols-2 gap-3 border-t border-black/5 pt-3 md:grid-cols-5">
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
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs text-amber-700">{t('tokenIssuedHint')}</p>
          <code className="num block break-all rounded bg-white px-2 py-1 text-xs">{issued}</code>
        </div>
      )}
      <table className="mb-3 w-full text-sm">
        <tbody>
          {tokens.map((tk) => (
            <tr key={tk.id} className="border-t border-black/5 first:border-0">
              <td className="py-1.5"><code className="num text-xs">xhp_{tk.prefix}…</code></td>
              <td className="py-1.5"><Badge tone={tk.scope === 'write' ? 'amber' : 'gray'}>{tk.scope === 'write' ? t('scopeWrite') : t('scopeRead')}</Badge></td>
              <td className="py-1.5 text-xs text-ink-400 num">{t('expiresAt')} {fmtDateTime(tk.expiresAt)}</td>
              <td className="py-1.5">{tk.revokedAt && <Badge tone="red">{t('revokedTag')}</Badge>}</td>
              <td className="py-1.5 text-right">
                {!tk.revokedAt && <Btn onClick={() => setRevoking(tk)}>{t('revoke')}</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={(e) => void issue(e)} className="grid grid-cols-2 gap-3 border-t border-black/5 pt-3 md:grid-cols-3">
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
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-400">
            <th className="py-1">{t('auditTime')}</th>
            <th className="py-1">{t('auditOperator')}</th>
            <th className="py-1">{t('auditAction')}</th>
            <th className="py-1">{t('auditTarget')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-black/5">
              <td className="py-1.5 num text-xs">{fmtDateTime(e.createdAt)}</td>
              <td className="py-1.5">{e.username ?? '—'}</td>
              <td className="py-1.5"><code className="text-xs">{e.action}</code></td>
              <td className="py-1.5 text-xs text-ink-600">{e.targetType ? `${e.targetType}#${e.targetId ?? ''}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
