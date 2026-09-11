// 展示格式化：金额分→元（两位小数），输入元→分；日期 epoch 毫秒 ↔ YYYY-MM-DD（UTC，与后端指标口径一致）

export function fmtCents(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 元输入 → 分；非法返回 null
export function parseYuan(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function centsToYuanInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtDate(ms)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// <input type="date"> 值（YYYY-MM-DD）→ epoch 毫秒（UTC 零点）
export function dateInputToTs(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function tsToDateInput(ms: number | null | undefined): string {
  if (!ms) return '';
  return fmtDate(ms);
}

export function currentMonthUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 月份加减：addMonths('2026-03', -2) → '2026-01'
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return month;
}
