// Shared helpers for Commandes (prices in cents excl. VAT, i18n text maps).
import type { I18nText } from '../types/orders';

const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

export const mediaUrl = (path: string) => (path.startsWith('http') ? path : `${MEDIA_BASE_URL}${path}`);

export function pickText(t: I18nText | null | undefined, lang: string): string {
  if (!t) return '';
  const l = lang.slice(0, 2) as keyof I18nText;
  return t[l] || t.fr || t.en || t.es || '';
}

export function formatMoney(cents: number, lang: string): string {
  const locale = lang.startsWith('en') ? 'en-GB' : lang.startsWith('es') ? 'es-ES' : 'fr-FR';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Inclusive calendar days between two YYYY-MM-DD dates; 0 when invalid. */
export function rentalDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function formatDate(d: string | null | undefined, lang: string): string {
  if (!d) return '';
  const date = d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return d;
  const locale = lang.startsWith('en') ? 'en-GB' : lang.startsWith('es') ? 'es-ES' : 'fr-FR';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Local YYYY-MM-DD of today + n days. */
export function isoDayFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "12,50" / "12.5" -> 1250 cents; null when empty/invalid. */
export function parseEuros(s: string): number | null {
  const v = s.trim().replace(/\s/g, '').replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace(/\.00$/, ''));

export const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  shipped: 'bg-violet-100 text-violet-700',
  done: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-rose-100 text-rose-700',
};
