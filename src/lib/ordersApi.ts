// Client for backend/api/orders.php (Commandes). The licensee and admin actions
// are split server-side by token type.
import { authFetch } from './authFetch';
import type {
  AdminLineInput, OrderCategory, OrderContact, OrderKind, OrderProduct, OrderRequestDetail,
  OrderRequestSummary, OrderStatus, OrderSubmitInput, OrderVariant,
} from '../types/orders';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export class OrdersApiError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string> = {}) {
    super(message);
  }
}

function url(action: string, params: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ action });
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  return `${API_BASE_URL}/orders.php?${p.toString()}`;
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OrdersApiError(data.error || `HTTP ${res.status}`, res.status, data.errors || {});
  return data as T;
}

async function call<T>(u: string, body?: unknown): Promise<T> {
  const res = await authFetch(u, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return handle<T>(res);
}

export const ordersApi = {
  // Licensee
  catalog: () => call<{ categories: OrderCategory[]; products: OrderProduct[]; profile: OrderContact }>(url('catalog')),
  submit: (input: OrderSubmitInput) => call<{ request: OrderRequestDetail }>(url('submit'), input).then((r) => r.request),
  myRequests: (lang: string) => call<{ requests: OrderRequestSummary[] }>(url('my_requests', { lang })).then((r) => r.requests),
  myRequest: (id: number, lang: string) => call<{ request: OrderRequestDetail }>(url('my_request', { id, lang })).then((r) => r.request),
  cancel: (id: number, lang: string) => call<{ request: OrderRequestDetail }>(url('cancel', { lang }), { id }).then((r) => r.request),

  // Admin
  adminProducts: () => call<{ products: OrderProduct[]; categories: OrderCategory[] }>(url('admin_products')),
  productSave: (p: Omit<Partial<OrderProduct>, 'variants'> & { variants?: (Omit<OrderVariant, 'id'> & { id?: number })[] }) => call<{ product: OrderProduct }>(url('product_save'), p).then((r) => r.product),
  productDelete: (id: number) => call<{ ok: boolean }>(url('product_delete'), { id }),
  productUpload: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await authFetch(url('product_upload'), { method: 'POST', body: fd });
    return handle<{ file: string; url: string }>(res);
  },
  categorySave: (c: Partial<OrderCategory>) => call<{ category: OrderCategory }>(url('category_save'), c).then((r) => r.category),
  categoryDelete: (id: number) => call<{ ok: boolean }>(url('category_delete'), { id }),
  adminRequests: (kind: OrderKind, status?: OrderStatus | '') =>
    call<{ requests: OrderRequestSummary[] }>(url('admin_requests', { kind, ...(status ? { status } : {}) })).then((r) => r.requests),
  adminRequest: (id: number) => call<{ request: OrderRequestDetail }>(url('admin_request', { id })).then((r) => r.request),
  adminRequestUpdate: (id: number, lines: AdminLineInput[], rentStart?: string | null, rentEnd?: string | null) =>
    call<{ request: OrderRequestDetail }>(url('admin_request_update'), { id, lines, rent_start: rentStart, rent_end: rentEnd }).then((r) => r.request),
  adminRequestStatus: (id: number, status: OrderStatus, note: string, notify: boolean) =>
    call<{ request: OrderRequestDetail; mailed: boolean }>(url('admin_request_status'), { id, status, note, notify }),
  settings: () => call<{ notify_emails: string[] }>(url('settings')).then((r) => r.notify_emails),
  settingsSave: (emails: string[]) => call<{ notify_emails: string[] }>(url('settings_save'), { notify_emails: emails }).then((r) => r.notify_emails),
};
