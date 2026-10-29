// Licensee-customer types, managed by admins (Settings) - backend/api/customer_types.php.
import { useEffect, useState } from 'react';
import { authFetch } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface CustomerTypeDef {
  code: string;
  label_fr: string;
  label_en: string | null;
  label_es: string | null;
  sort_order: number;
  active: boolean;
  /** Admin list only: customers using this type. */
  in_use?: number;
}

export class CustomerTypesApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(action: string, body?: unknown): Promise<T> {
  const res = await authFetch(`${API_BASE_URL}/customer_types.php?action=${action}`, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CustomerTypesApiError(data.error || `HTTP ${res.status}`, res.status, data.code);
  return data as T;
}

type Labels = { label_fr: string; label_en?: string | null; label_es?: string | null };

export const customerTypesApi = {
  list: () => call<{ types: CustomerTypeDef[] }>('list').then((r) => r.types),
  create: (labels: Labels) => call<{ type: CustomerTypeDef }>('create', labels).then((r) => r.type),
  update: (code: string, patch: Partial<Labels> & { active?: boolean }) =>
    call<{ type: CustomerTypeDef }>('update', { code, ...patch }).then((r) => r.type),
  reorder: (codes: string[]) => call<{ success: true }>('reorder', { codes }),
  remove: (code: string) => call<{ success: true }>('delete', { code }),
};

/** A type's label in the UI language (en / es fall back to the French label). */
export function customerTypeLabel(types: CustomerTypeDef[], code: string | null | undefined, lang: string): string | null {
  if (!code) return null;
  const t = types.find((x) => x.code === code);
  if (!t) return code;
  const l = lang.slice(0, 2);
  return (l === 'en' && t.label_en) || (l === 'es' && t.label_es) || t.label_fr;
}

// One fetch per page load, shared by every screen that labels a customer.
let cache: Promise<CustomerTypeDef[]> | null = null;

export function invalidateCustomerTypes(): void {
  cache = null;
}

export function useCustomerTypes(): CustomerTypeDef[] {
  const [types, setTypes] = useState<CustomerTypeDef[]>([]);
  useEffect(() => {
    let alive = true;
    cache ??= customerTypesApi.list().catch(() => {
      cache = null;
      return [];
    });
    void cache.then((list) => { if (alive) setTypes(list); });
    return () => { alive = false; };
  }, []);
  return types;
}
