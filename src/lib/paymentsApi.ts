// Client for backend/api/payments.php (licensee payments setup) and
// backend/api/events_admin.php (admin-only Events settings).
import { authFetch } from './authFetch';
import type {
  AdminLicenseeEvents,
  CommissionInvoice,
  RevenueRow,
  EventsPlatformSettings,
  FieldErrors,
  LegalInfo,
  PaymentsStatus,
} from '../types/payments';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export class PaymentsApiError extends Error {
  constructor(message: string, public status: number, public errors?: FieldErrors, public missing?: string[]) {
    super(message);
  }
}

function url(file: string, action: string, clientId?: number, params: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ action });
  if (clientId) p.set('client_id', String(clientId));
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  return `${API_BASE_URL}/${file}?${p.toString()}`;
}

async function call<T>(u: string, body?: unknown): Promise<T> {
  const res = await authFetch(u, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PaymentsApiError(data.error || `HTTP ${res.status}`, res.status, data.errors, data.missing);
  return data as T;
}

export type LegalSaveInput = Partial<LegalInfo> & { slug?: string | null; accept_terms?: boolean };

export const paymentsApi = {
  status: (clientId?: number) =>
    call<{ data: PaymentsStatus }>(url('payments.php', 'status', clientId)).then((r) => r.data),

  /** Saves even when required fields are missing (they come back in `errors` + status.missing). */
  saveLegal: (input: LegalSaveInput, clientId?: number) =>
    call<{ data: PaymentsStatus; errors: FieldErrors }>(url('payments.php', 'legal_save', clientId), input),

  /** Returns the Stripe-hosted onboarding URL to redirect to. */
  connectStart: (clientId?: number) =>
    call<{ url: string }>(url('payments.php', 'connect_start', clientId), {}).then((r) => r.url),

  connectRefresh: (clientId?: number) =>
    call<{ data: PaymentsStatus }>(url('payments.php', 'connect_refresh', clientId), {}).then((r) => r.data),

  invoices: (clientId?: number) =>
    call<{ invoices: CommissionInvoice[] }>(url('payments.php', 'invoices', clientId)).then((r) => r.invoices),

  downloadInvoice: (inv: CommissionInvoice, what: 'pdf' | 'csv', clientId?: number) =>
    downloadFile(url('payments.php', 'invoice_download', clientId, { id: inv.id, what }), `${inv.number}.${what}`),
};

/** Fetch an authenticated file and hand it to the browser as a download. */
export async function downloadFile(u: string, filename: string): Promise<void> {
  const res = await authFetch(u);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new PaymentsApiError(data.error || `HTTP ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const eventsAdminApi = {
  settings: () =>
    call<{ data: EventsPlatformSettings }>(url('events_admin.php', 'settings')).then((r) => r.data),

  saveSettings: (input: Partial<EventsPlatformSettings>) =>
    call<{ data: EventsPlatformSettings }>(url('events_admin.php', 'settings_save'), input).then((r) => r.data),

  licensee: (clientId: number) =>
    call<{ data: AdminLicenseeEvents }>(url('events_admin.php', 'licensee', undefined, { client_id: clientId })).then((r) => r.data),

  saveLicensee: (input: {
    client_id: number;
    events_enabled?: boolean;
    commission_bp?: number | null;
    commission_fixed_cents?: number | null;
    slug?: string | null;
  }) => call<{ data: AdminLicenseeEvents }>(url('events_admin.php', 'licensee_save'), input).then((r) => r.data),

  viesRecheck: (clientId: number) =>
    call<{ data: AdminLicenseeEvents }>(url('events_admin.php', 'vies_recheck'), { client_id: clientId }).then((r) => r.data),

  revenue: (year: number) =>
    call<{ year: number; rows: RevenueRow[] }>(url('events_admin.php', 'revenue', undefined, { year })).then((r) => r.rows),

  invoices: (period?: string) =>
    call<{ invoices: CommissionInvoice[] }>(url('events_admin.php', 'invoices', undefined, period ? { period } : {})).then((r) => r.invoices),

  generateInvoices: (period: string, clientId?: number) =>
    call<{ issued: number }>(url('events_admin.php', 'invoices_generate'), clientId ? { period, client_id: clientId } : { period }).then((r) => r.issued),

  downloadInvoice: (inv: CommissionInvoice, what: 'pdf' | 'csv') =>
    downloadFile(url('events_admin.php', 'invoice_download', undefined, { id: inv.id, what }), `${inv.number}.${what}`),
};

/** 300 bp -> "3 %"; 250 -> "2,5 %" (locale-aware). */
export function formatBp(bp: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100)} %`;
}

export function formatCents(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
