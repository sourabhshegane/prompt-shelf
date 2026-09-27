/** "just now", "5m ago", "3h ago", "2d ago", then a short local date such as "12 Sep". */
export function ago(iso: string | undefined, now = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Full local date and time, e.g. "27 Sep 2026, 14:03". */
export function localTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
