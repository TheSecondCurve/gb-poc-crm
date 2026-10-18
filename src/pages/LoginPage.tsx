// 登录页：完全照搬 gb-pmo 分屏刊物式 —— 左侧纸纹封面（品牌 + 宋体大标题 + 目录条 + 水印字），
// 右侧工作台入口表单；session cookie，登录成功进入看板
import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../store';
import { Brand } from '../components/editorial';
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
    <div className="grid min-h-full bg-[var(--color-card)] md:grid-cols-[1.12fr_0.88fr]">
      <section data-testid="login-cover" className="paper-grid editorial-enter relative hidden flex-col justify-between overflow-hidden border-r border-[var(--color-line)] p-10 md:flex lg:p-14 xl:p-16">
        <Brand />
        <div className="relative z-10 my-16 max-w-[680px]">
          <div className="editorial-kicker">{t('loginKicker')}</div>
          <h1 className="display-type mt-7 text-[46px] leading-[1.16] tracking-[-0.055em] lg:text-[60px] xl:text-[68px]">{t('loginHeadline')}</h1>
          <p className="mt-7 max-w-[440px] text-[14px] leading-7 text-[var(--color-ink-soft)]">{t('loginSub')}</p>
        </div>
        <div className="relative z-10 grid grid-cols-3 border-t border-[var(--color-ink)] pt-4 text-[11px] text-[var(--color-ink-soft)]">
          {[['01', t('loginPoint1')], ['02', t('loginPoint2')], ['03', t('loginPoint3')]].map(([index, label]) => (
            <div key={index} className="flex items-baseline gap-2">
              <span className="num text-[9px] text-[var(--color-brand)]">{index}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="display-type pointer-events-none absolute -bottom-20 -right-6 text-[220px] leading-none text-[var(--color-ink)] opacity-[0.025]">{t('brandChar')}</div>
      </section>

      <main className="flex min-h-screen flex-col md:min-h-0">
        <div className="border-b border-[var(--color-line)] p-5 md:hidden"><Brand compact /></div>
        <div className="flex flex-1 items-center justify-center px-6 py-12 md:px-10 lg:px-16">
          <form onSubmit={(e) => void submit(e)} className="editorial-enter-late w-full max-w-[360px]">
            <div className="editorial-kicker">Workspace access</div>
            <h2 className="display-type mt-4 text-[32px] leading-tight">{t('loginWelcome')}</h2>
            <p className="mb-9 mt-3 text-[13px] text-[var(--color-ink-soft)]">{t('loginTitle')}</p>
            <Field label={t('username')}>
              <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label={t('password')}>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && <p role="alert" className="mb-4 rounded-[3px] bg-[var(--color-bad-soft)] px-3 py-2 text-[12px] text-[var(--color-bad)]">{error}</p>}
            <div className="mt-6 [&>button]:w-full">
              <Btn type="submit" variant="primary" loading={loading}>
                {loading ? `${t('login')}…` : <>{t('login')}<ArrowRight aria-hidden="true" size={14} /></>}
              </Btn>
            </div>
            <div className="mt-8 border-t border-[var(--color-line)] pt-4 text-[10px] leading-5 text-[var(--color-ink-faint)]">
              {t('brandName')} · {t('brandLatin')}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
