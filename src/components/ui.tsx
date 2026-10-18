// 手写极简组件层：Btn / Field / TextInput / Select / Modal / ConfirmModal / Spinner / ToastHost / Badge / Card / Amount / EmptyState
// 版式语言完全照搬 gb-pmo 编辑部刊物风；交互规范不变：Esc 关弹层、破坏性操作 Modal 二次确认、Toast 右下角 2.6s、微动效 ≤0.2s
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { fmtCents } from '../format';

export function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center text-[12px] tracking-[0.12em] text-[var(--color-ink-soft)]" role="status" aria-label="loading">
      加载中…
    </div>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'danger';

export function Btn({
  variant = 'ghost', loading = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-45 min-h-9 px-4 py-2 text-[13px]';
  const styles: Record<BtnVariant, string> = {
    primary: 'border border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-[0_4px_14px_rgb(52_79_196/0.16)] hover:-translate-y-px hover:bg-[var(--color-brand-deep)]',
    ghost: 'border border-[var(--color-line-strong)] bg-[var(--color-card)] text-[var(--color-ink)] hover:-translate-y-px hover:border-[var(--color-ink-soft)] hover:shadow-[0_3px_10px_rgb(32_35_31/0.06)]',
    danger: 'border border-[var(--color-bad)] bg-[var(--color-bad-soft)] text-[var(--color-bad)] hover:-translate-y-px hover:bg-[var(--color-bad)] hover:text-white',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium leading-5 text-[var(--color-ink-soft)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full min-w-0 rounded-[3px] border border-[var(--color-line-strong)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_3px_var(--color-brand-soft)]';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#171914]/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`pop-in max-h-[88dvh] w-full overflow-y-auto rounded-[6px] border border-[var(--color-line)] bg-[var(--color-card)] shadow-[var(--shadow-editorial)] ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-line)] px-5 py-4 md:px-6">
          <div className="display-type text-[19px] font-semibold">{title}</div>
          <button
            onClick={onClose} aria-label="close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >✕</button>
        </div>
        <div className="p-5 md:p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, desc, confirmLabel, onConfirm, onClose, loading = false, confirmWord }: {
  title: string; desc: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; loading?: boolean;
  confirmWord?: string; // 设置后须输入确认词才能点确认（高危操作）
}) {
  const [word, setWord] = useState('');
  const blocked = confirmWord !== undefined && word !== confirmWord;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[var(--color-bad)]" />
        <p className="whitespace-pre-line text-[13px] leading-6 text-[var(--color-ink-soft)]">{desc}</p>
      </div>
      {confirmWord !== undefined && (
        <input
          className="cell-input mb-4 w-full"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder={confirmWord}
          aria-label="确认词"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- 确认词输入是打断式确认，聚焦输入框是刻意的
          autoFocus
        />
      )}
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="danger" onClick={onConfirm} loading={loading} disabled={blocked}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

export function ToastHost() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pop-in rounded-[4px] border px-3.5 py-2 text-[13px] shadow-[var(--shadow-float)] ${
            t.kind === 'err'
              ? 'border-[var(--color-bad)] bg-[var(--color-bad-soft)] text-[var(--color-bad)]'
              : 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-card)]'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// Tone→底色的映射在组件层唯一（Badge 共用；色彩语义与 gb-pmo 同源）
export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const tones = {
    gray: 'bg-[var(--color-panel)] text-[var(--color-ink-soft)]',
    green: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
    amber: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
    red: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
    blue: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
  } as const;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, extra, children, className = '' }: {
  title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`editorial-enter-late rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] ${className}`}>
      {(title || extra) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3.5 md:px-6">
          <div className="text-[14px] font-semibold tracking-[-0.01em]">{title}</div>
          <div className="flex flex-wrap items-center gap-2">{extra}</div>
        </header>
      )}
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

/** 编辑部式数据块：小标签 + 超大细体等宽数字 */
export function StatBlock({ label, children, accent, aside }: {
  label: string; children: ReactNode; accent?: 'ok' | 'warn' | 'bad'; aside?: ReactNode;
}) {
  const accentCls = accent === 'bad' ? 'text-[var(--color-bad)]' : accent === 'warn' ? 'text-[var(--color-warn)]' : accent === 'ok' ? 'text-[var(--color-ok)]' : 'text-[var(--color-ink)]';
  return (
    <div className="flex flex-col justify-between border-b border-[var(--color-line)] p-5 last:border-b-0 md:p-6 [&:not(:last-child)]:sm:border-r">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] text-[var(--color-ink-soft)]">{label}</div>
        {aside}
      </div>
      <div className={`num mt-4 text-[34px] font-light leading-none tracking-[-0.05em] ${accentCls}`}>{children}</div>
    </div>
  );
}

export function Amount({ cents, signed = false, className = '' }: { cents: number | null | undefined; signed?: boolean; className?: string }) {
  const v = cents ?? 0;
  const color = signed ? (v > 0 ? 'text-[var(--color-ok)]' : v < 0 ? 'text-[var(--color-bad)]' : 'text-[var(--color-ink-soft)]') : 'text-[var(--color-ink)]';
  return <span className={`num ${color} ${className}`}>{signed && v > 0 ? '+' : ''}{fmtCents(v)}</span>;
}

export function EmptyState({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] px-6 py-14 text-center">
      <span aria-hidden="true" className="mb-1 block h-px w-8 bg-[var(--color-line-strong)]" />
      <p className="display-type text-[22px] text-[var(--color-ink)]">{title}</p>
      {desc && <p className="max-w-md text-[13px] leading-6 text-[var(--color-ink-soft)]">{desc}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
