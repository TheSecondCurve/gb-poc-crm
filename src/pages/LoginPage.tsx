// 登录页：session cookie，登录成功进入看板
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Btn, Field, TextInput } from '../components/ui';
import { ApiError } from '../api';

export function LoginPage() {
  const { t, login } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('loginFailed') : (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form onSubmit={(e) => void submit(e)} className="anim-pop w-full max-w-sm rounded-lg border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-base font-bold text-ink-900">{t('appName')}</h1>
        <p className="mb-5 text-xs text-ink-400">{t('loginTitle')}</p>
        <div className="mb-3 flex flex-col gap-3">
          <Field label={t('username')}>
            <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </Field>
          <Field label={t('password')}>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-danger-500">{error}</p>}
        <Btn type="submit" variant="primary" loading={loading} className="w-full justify-center">
          {t('login')}
        </Btn>
      </form>
    </div>
  );
}
