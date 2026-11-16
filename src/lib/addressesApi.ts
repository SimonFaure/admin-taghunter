// Client for backend/api/client_addresses.php. Licensee token = own account;
// admins pass the licensee id.
import { authFetch } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface MainAddress {
  company: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
}

export interface ShippingAddress extends MainAddress {
  name: string | null;
}

export interface ClientAddresses {
  main: MainAddress;
  shipping_same_as_main: boolean;
  shipping: ShippingAddress;
}

export class AddressesApiError extends Error {
  constructor(message: string, public errors: Record<string, string> = {}) {
    super(message);
  }
}

const url = (action: string, clientId?: number) =>
  `${API_BASE_URL}/client_addresses.php?action=${action}${clientId ? `&client_id=${clientId}` : ''}`;

async function handle(res: Response): Promise<ClientAddresses> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AddressesApiError(data.error || `HTTP ${res.status}`, data.errors || {});
  return data as ClientAddresses;
}

export const addressesApi = {
  get: (clientId?: number) => authFetch(url('get', clientId)).then(handle),
  save: (data: ClientAddresses, clientId?: number) =>
    authFetch(url('save', clientId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(handle),
};
