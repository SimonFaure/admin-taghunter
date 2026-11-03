// Client for backend/api/events.php (Studio events editor). A licensee token is
// scoped server-side; admins pass the licensee's clientId.
import { authFetch } from './authFetch';
import type {
  BookingUpdateInput, ChecklistCode, EventAddon, EventBooking, EventBookingDetail, EventContent, EventEditorPayload, EventJob,
  EventLang, EventListItem, EventQuestion, EventSettings, EventSlot, ManualBookingInput, PromoCode, StaffLink, TicketType, UploadKind,
} from '../types/events';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export class EventsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string>,
    public missing?: ChecklistCode[],
    /** Whole error body (e.g. max_cents for invalid_amount). */
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let adminClientId: number | undefined;
/** Admin views editing a licensee's events set this once. */
export function setEventsClientId(id: number | undefined) {
  adminClientId = id;
}

function url(action: string, params: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ action });
  if (adminClientId) p.set('client_id', String(adminClientId));
  for (const [k, v] of Object.entries(params)) p.set(k, String(v));
  return `${API_BASE_URL}/events.php?${p.toString()}`;
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new EventsApiError(data.error || `HTTP ${res.status}`, res.status, data.errors, data.missing, data);
  return data as T;
}

async function call<T>(u: string, body?: unknown): Promise<T> {
  const res = await authFetch(u, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return handle<T>(res);
}

export type EventSettingsPatch = Partial<Omit<EventSettings, 'id' | 'uniqid' | 'status'>>;

export const eventsApi = {
  list: () => call<{ events: EventListItem[] }>(url('list')).then((r) => r.events),
  get: (id: number) => call<EventEditorPayload>(url('get', { id })),
  create: (title: string, mainLanguage: EventLang) =>
    call<EventEditorPayload>(url('create'), { title, main_language: mainLanguage }),
  update: (id: number, patch: EventSettingsPatch) => call<EventEditorPayload>(url('update'), { id, ...patch }),
  contentSave: (id: number, lang: EventLang, content: EventContent) =>
    call<EventEditorPayload>(url('content_save'), { id, lang, content }),
  ticketTypesSave: (id: number, types: TicketType[]) => call<EventEditorPayload>(url('ticket_types_save'), { id, types }),
  slotsSave: (id: number, slots: EventSlot[]) => call<EventEditorPayload>(url('slots_save'), { id, slots }),
  slotsGenerate: (id: number, input: {
    date: string; from: string; to: string; every_minutes: number; duration_minutes: number; capacity: number; ticket_type_ids: number[];
  }) => call<EventEditorPayload>(url('slots_generate'), { id, ...input }),
  questionsSave: (id: number, questions: EventQuestion[]) => call<EventEditorPayload>(url('questions_save'), { id, questions }),
  upload: async (id: number, kind: UploadKind, file: File) => {
    const fd = new FormData();
    fd.append('id', String(id));
    fd.append('kind', kind);
    fd.append('file', file);
    const res = await authFetch(url('upload'), { method: 'POST', body: fd });
    return handle<{ file: string; url: string; width?: number; height?: number }>(res);
  },
  publish: (id: number) => call<EventEditorPayload>(url('publish'), { id }),
  unpublish: (id: number) => call<EventEditorPayload>(url('unpublish'), { id }),
  duplicate: (id: number) => call<EventEditorPayload>(url('duplicate'), { id }),
  remove: (id: number) => call<{ deleted?: boolean; archived?: boolean }>(url('delete'), { id }),
  bookings: (id: number) => call<{ bookings: EventBooking[] }>(url('bookings', { id })).then((r) => r.bookings),

  // Phase 3: back-office
  addonsSave: (id: number, addons: EventAddon[]) => call<EventEditorPayload>(url('addons_save'), { id, addons }),
  promoSave: (id: number, codes: PromoCode[]) => call<EventEditorPayload>(url('promo_save'), { id, codes }),
  booking: (bookingId: number) =>
    call<{ booking: EventBookingDetail }>(url('booking', { booking_id: bookingId })).then((r) => r.booking),
  bookingManualCreate: (id: number, input: ManualBookingInput) =>
    call<{ booking: EventBookingDetail }>(url('booking_manual_create'), { id, ...input }).then((r) => r.booking),
  bookingUpdate: (bookingId: number, input: BookingUpdateInput) =>
    call<{ booking: EventBookingDetail }>(url('booking_update'), { booking_id: bookingId, ...input }).then((r) => r.booking),
  bookingRefund: (bookingId: number, amountCents: number, reason: string, notify = true) =>
    call<{ booking: EventBookingDetail }>(url('booking_refund'), { booking_id: bookingId, amount_cents: amountCents, reason, notify }).then((r) => r.booking),
  bookingCancel: (bookingId: number, input: { refund: boolean; reason: string; notify: boolean }) =>
    call<{ booking: EventBookingDetail }>(url('booking_cancel'), { booking_id: bookingId, ...input }).then((r) => r.booking),
  bookingResend: (bookingId: number) => call<{ queued: boolean }>(url('booking_resend'), { booking_id: bookingId }),
  slotCancel: (id: number, slotId: number, reason: string) => call<EventEditorPayload>(url('slot_cancel'), { id, slot_id: slotId, reason }),
  eventCancel: (id: number, reason: string) => call<EventEditorPayload>(url('event_cancel'), { id, reason }),
  job: (jobId: number) => call<{ job: EventJob }>(url('job', { job_id: jobId })).then((r) => r.job),

  // Phase 4: staff check-in links (the PIN is returned once)
  staffLinkCreate: (id: number, label: string) => call<{ link: StaffLink; pin: string }>(url('staff_link_create'), { id, label }),
  staffLinkPin: (id: number, linkId: number) => call<{ link: StaffLink; pin: string }>(url('staff_link_pin'), { id, link_id: linkId }),
  staffLinkRevoke: (id: number, linkId: number) => call<{ revoked: boolean }>(url('staff_link_revoke'), { id, link_id: linkId }),
};

/** "18,50" / "18.5" -> 1850; empty / invalid -> null */
export function eurosToCents(v: string): number | null {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function centsToEuros(c: number | null | undefined): string {
  if (c === null || c === undefined) return '';
  return (c / 100).toFixed(2).replace(/\.00$/, '');
}

export function formatMoney(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Local "YYYY-MM-DDTHH:MM" -> readable, without touching time zones. */
export function formatLocal(local: string | null | undefined, locale: string): string {
  if (!local) return '';
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  const ds = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  return t ? `${ds} ${t.slice(0, 5)}` : ds;
}
