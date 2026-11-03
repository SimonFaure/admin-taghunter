// Client for backend/api/events_checkin.php (Events phase 4, event day).
// Two modes:
//  - staff: volunteers log in with the link token + PIN, then send
//    `Authorization: Bearer <session>` (plain fetch, never the Studio token);
//  - licensee: the normal Studio token (authFetch) + ?event_id.
import { authFetch } from './authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface CheckinTicket {
  id: number;
  label: string;
  role: 'player' | 'individual' | string;
  first_name: string | null;
  age: number | null;
  checked_in_at: string | null;
}

export interface CheckinBooking {
  id: number;
  reference: string;
  team_name: string | null;
  buyer_name: string;
  source: string;
  payment_due: boolean;
  tickets: CheckinTicket[];
  // licensee mode only
  buyer_email?: string | null;
  buyer_phone?: string | null;
  total_cents?: number;
  // scan result only
  slot_id?: number;
  slot_starts_at?: string;
  status?: string;
}

export interface CheckinSlot {
  id: number;
  starts_at: string;
  ends_at: string;
  label: string;
  capacity: number;
  bookings: CheckinBooking[];
}

export interface CheckinDay {
  event: { id: number; title: string; timezone: string; slug: string };
  date: string;
  days: string[];
  slots: CheckinSlot[];
  staff: boolean;
}

export class CheckinApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type CheckinMode = { kind: 'staff'; session: string } | { kind: 'licensee'; eventId: number };

function url(action: string, mode: CheckinMode | null, params: Record<string, string> = {}): string {
  const p = new URLSearchParams({ action, ...params });
  if (mode?.kind === 'licensee') p.set('event_id', String(mode.eventId));
  return `${API_BASE_URL}/events_checkin.php?${p.toString()}`;
}

async function send<T>(mode: CheckinMode | null, u: string, body?: unknown): Promise<T> {
  const init: RequestInit = body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res: Response;
  try {
    if (mode?.kind === 'licensee') {
      res = await authFetch(u, init);
    } else {
      const headers = new Headers(init.headers || {});
      if (mode?.kind === 'staff') headers.set('Authorization', `Bearer ${mode.session}`);
      res = await fetch(u, { ...init, headers });
    }
  } catch {
    throw new CheckinApiError('network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CheckinApiError(data.error || `HTTP ${res.status}`, res.status);
  return data as T;
}

export const checkinApi = {
  staffLogin: (token: string, pin: string) =>
    send<{ session: string; event: { id: number; title: string }; label: string | null }>(null, url('staff_login', null), { token, pin }),
  day: (mode: CheckinMode, date?: string) => send<CheckinDay>(mode, url('day', mode, date ? { date } : {})),
  scan: (mode: CheckinMode, code: string) =>
    send<{ booking: CheckinBooking }>(mode, url('scan', mode), { code }).then((r) => r.booking),
  checkin: (mode: CheckinMode, bookingId: number, ticketIds: number[] | null, action: 'in' | 'undo') =>
    send<{ tickets: CheckinTicket[] }>(mode, url('checkin', mode), {
      client_uuid: uuidV4(), booking_id: bookingId, ticket_ids: ticketIds, action, occurred_at: new Date().toISOString(),
    }).then((r) => r.tickets),
};

/** crypto.randomUUID needs a secure context; fall back to getRandomValues. */
export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
