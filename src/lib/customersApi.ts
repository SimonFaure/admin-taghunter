// Client for backend/api/customers.php (licensee customers). A licensee token
// is scoped server-side; admins pass the licensee's `clientId`.
import { authFetch } from './authFetch';
import type { Customer, CustomerGame, CustomerInput } from '../types/customer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export class CustomersApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

function url(action: string, clientId?: number, params: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams({ action });
  if (clientId) p.set('client_id', String(clientId));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  return `${API_BASE_URL}/customers.php?${p.toString()}`;
}

async function call<T>(u: string, body?: unknown): Promise<T> {
  const res = await authFetch(u, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CustomersApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
  return data as T;
}

export const customersApi = {
  list: (clientId?: number, opts: { q?: string; includeArchived?: boolean; sort?: 'name' | 'last_played' | 'games' } = {}) =>
    call<{ customers: Customer[] }>(url('list', clientId, {
      q: opts.q, include_archived: opts.includeArchived ? 1 : undefined, sort: opts.sort,
    })).then((r) => r.customers),

  get: (id: string, clientId?: number) =>
    call<{ customer?: Customer; merged_from?: { id: string; name: string }[]; redirect_to?: string | null }>(url('get', clientId, { id })),

  history: (id: string, clientId?: number) =>
    call<{ games: CustomerGame[] }>(url('history', clientId, { id })).then((r) => r.games),

  candidates: (id: string, clientId: number | undefined, opts: { filter: 'untagged' | 'other' | 'all'; q?: string; offset?: number }) =>
    call<{ games: CustomerGame[]; total: number }>(url('candidates', clientId, {
      id, filter: opts.filter, q: opts.q, offset: opts.offset, limit: 50,
    })),

  create: (input: CustomerInput, clientId?: number) =>
    call<{ customer: Customer }>(url('create', clientId), input).then((r) => r.customer),

  update: (id: string, input: CustomerInput, clientId?: number) =>
    call<{ customer: Customer }>(url('update', clientId), { id, ...input }).then((r) => r.customer),

  archive: (id: string, archived: boolean, clientId?: number) =>
    call<{ success: true }>(url('archive', clientId), { id, archived }),

  remove: (id: string, clientId?: number) => call<{ success: true }>(url('delete', clientId), { id }),

  merge: (sourceId: string, targetId: string, clientId?: number) =>
    call<{ games_moved: number }>(url('merge', clientId), { source_id: sourceId, target_id: targetId }),

  assign: (summaryUuids: string[], customerId: string | null, clientId?: number) =>
    call<{ updated: number }>(url('assign', clientId), { summary_uuids: summaryUuids, customer_id: customerId }),

  import: (rows: CustomerInput[], clientId?: number) =>
    call<{ created: number; skipped: { index: number; reason: 'exists' | 'duplicate_in_file' | 'invalid' }[] }>(
      url('import', clientId), { rows }),
};
