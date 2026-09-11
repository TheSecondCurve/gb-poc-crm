// 手写极简组件层：Btn / Field / Input / Select / Modal / ConfirmModal / Spinner / ToastHost / Badge / Card / EmptyState
// 交互规范：Esc 关弹层、破坏性操作 Modal 二次确认、Toast 右下角 2.6s、微动效 ≤0.2s
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X, AlertTriangle, Inbox } from 'lucide-react';
import { useStore } from '../store';
import { fmtCents } from '../format';

export function Spinner() {
  return (
    <div className="flex justify-center py-10" role="status" aria-label="loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'danger';

export function Btn({
  variant = 'ghost', loading = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const base = 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    ghost: 'text-ink-600 hover:bg-black/5',
    danger: 'bg-danger-500 text-white hover:bg-danger-600',
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
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500';

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
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`anim-pop max-h-[85vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} aria-label="close" className="rounded p-1 text-ink-400 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>
        {children}
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
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger-500" />
        <p className="text-sm whitespace-pre-line text-ink-600">{desc}</p>
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
          className={`anim-pop rounded-md px-3.5 py-2 text-sm text-white shadow-lg ${t.kind === 'err' ? 'bg-danger-500' : 'bg-ink-900'}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const tones = {
    gray: 'bg-black/5 text-ink-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-brand-50 text-brand-700',
  } as const;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, extra, children, className = '' }: {
  title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-lg border border-black/5 bg-white p-4 shadow-sm ${className}`}>
      {title && (
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

export function Amount({ cents, signed = false, className = '' }: { cents: number | null | undefined; signed?: boolean; className?: string }) {
  const v = cents ?? 0;
  const color = signed ? (v > 0 ? 'text-green-600' : v < 0 ? 'text-danger-500' : 'text-ink-600') : 'text-ink-900';
  return <span className={`num ${color} ${className}`}>{signed && v > 0 ? '+' : ''}{fmtCents(v)}</span>;
}

export function EmptyState({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-black/10 bg-white px-6 py-14 text-center">
      <Inbox size={28} className="text-ink-400" />
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {desc && <p className="max-w-md text-xs text-ink-600">{desc}</p>}
      {children && <div className="mt-2 flex gap-2">{children}</div>}
    </div>
  );
}
