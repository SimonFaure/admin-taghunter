// Events phases 2-3: Studio editor payloads (backend/api/events.php).
// Times in the editor are LOCAL to the event time zone: "YYYY-MM-DDTHH:MM".

export type EventLang = 'fr' | 'en' | 'es';
export const EVENT_LANGS: EventLang[] = ['fr', 'en', 'es'];

export type I18n = Partial<Record<EventLang, string>>;

export type SectionKey = 'hero' | 'description' | 'practical' | 'steps' | 'testimonials' | 'partners' | 'faq' | 'sessions';

export interface EventLayout {
  sections: { key: SectionKey; enabled: boolean }[];
  hero: { image: string | null; video_url: string | null; countdown: boolean };
  partners: { name: string; logo: string | null; url: string | null }[];
}

export interface EventTheme {
  primary: string;
  accent: string;
  mode: 'dark' | 'light';
  heading_font: string | null;
  logo: string | null;
}

export type EventStatus = 'draft' | 'published' | 'archived';
export type RefundPolicy = 'none' | 'full_until' | 'partial';
export type Audience = 'all' | 'kids' | 'family' | 'adults';

export interface EventSettings {
  id: number;
  uniqid: string;
  slug: string;
  status: EventStatus;
  listed: boolean;
  sales_paused: boolean;
  main_language: EventLang;
  languages: EventLang[];
  timezone: string;
  currency: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_postal_code: string | null;
  venue_city: string | null;
  venue_country: string | null;
  lat: number | null;
  lng: number | null;
  region: string | null;
  audience: Audience;
  team_size_min: number;
  team_size_max: number;
  require_player_details: boolean;
  minor_age_threshold: number | null;
  adult_age: number;
  sales_cutoff_minutes: number;
  refund_policy: RefundPolicy;
  refund_days_before: number | null;
  refund_retention_bp: number | null;
  terms_pdf: string | null;
  image_rights_enabled: boolean;
  newsletter_enabled: boolean;
  licensee_alert_email: string | null;
  availability_display: 'status' | 'exact';
  few_left_bp: number;
  last_tickets_banner: boolean;
  layout: EventLayout;
  theme: EventTheme;
  first_slot_at: string | null;
  last_slot_end_at: string | null;
  published_at: string | null;
}

export interface EventContent {
  title: string;
  subtitle: string;
  date_text: string;
  cta_label: string;
  description_md: string;
  practical: { hours: string; ages: string; info_md: string };
  steps: { title: string; text: string }[];
  testimonials: { quote: string; author: string; role: string }[];
  faq: { q: string; a: string }[];
  terms_text_md: string;
  seo_description: string;
}

export interface PriceStep {
  id?: number;
  price_cents: number;
  ends_at: string | null; // local
  ends_after_sold: number | null;
  label_i18n?: I18n;
}

export type TicketRole = 'player' | 'individual';

export interface TicketType {
  id?: number;
  role: TicketRole;
  label_i18n: I18n;
  description_i18n: I18n;
  base_price_cents: number;
  vat_bp: number | null;
  min_age: number | null;
  cap_per_slot: number | null;
  max_per_booking: number | null;
  active: boolean;
  steps: PriceStep[];
}

export interface EventSlot {
  id?: number;
  starts_at: string; // local
  starts_at_utc?: string;
  duration_minutes: number;
  capacity: number;
  status: 'open' | 'closed' | 'cancelled';
  scenario_id: number | null;
  label_i18n: I18n;
  /** ticket_type_id -> cap (null = no specific cap) */
  types: Record<string, number | null>;
  taken?: number;
}

export type QuestionKind = 'text' | 'choice' | 'checkbox';

export interface EventQuestion {
  id?: number;
  kind: QuestionKind;
  label_i18n: I18n;
  options_i18n: I18n[];
  required: boolean;
}

export type ChecklistCode =
  | 'title' | 'terms' | 'venue' | 'ticket_types' | 'slots' | 'legal_info' | 'platform_terms' | 'stripe';

export interface EventEditorPayload {
  event: EventSettings;
  contents: Partial<Record<EventLang, EventContent>>;
  ticket_types: TicketType[];
  slots: EventSlot[];
  questions: EventQuestion[];
  media_base: string;
  media: { logo: string | null; hero: string | null; terms_pdf: string | null };
  fonts: string[];
  public_url: string;
  preview_url: string;
  checklist: ChecklistCode[];
  bookings_count: number;
  created?: number;
  // Phase 3
  addons: EventAddon[];
  promo_codes: PromoCode[];
  jobs: EventJob[];
  cancelled_at: string | null;
  job?: EventJob | null;
  // Phase 4
  staff_links?: StaffLink[];
  checkin_counts?: { expected: number; arrived: number };
}

// ── Phase 3: add-ons, promo codes, jobs, back-office bookings ──────────

export interface AddonVariant {
  id?: number;
  label_i18n: I18n;
  /** null = the add-on's price */
  price_cents: number | null;
  /** null = unlimited */
  stock: number | null;
  sold?: number;
  active: boolean;
}

export interface EventAddon {
  id?: number;
  label_i18n: I18n;
  description_i18n: I18n;
  image: string | null;
  image_url?: string | null;
  price_cents: number;
  vat_bp: number | null;
  max_per_booking: number | null;
  active: boolean;
  variants: AddonVariant[];
}

export type PromoKind = 'percent' | 'fixed';

export interface PromoCode {
  id?: number;
  code: string;
  kind: PromoKind;
  /** percent: basis points (1000 = 10 %); fixed: cents */
  value: number;
  max_uses: number | null;
  valid_from: string | null; // local
  valid_until: string | null; // local
  active: boolean;
  uses?: number;
}

export interface EventJob {
  id: number;
  kind: 'cancel_slot' | 'cancel_event';
  slot_id: number | null;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: { total?: number; done?: number; failed?: number; refunded_cents?: number; last_error?: string };
  reason: string | null;
  created_at: string | null;
}

export interface EventListItem {
  id: number;
  slug: string;
  title: string;
  status: EventStatus;
  listed: boolean;
  first_slot_at: string | null;
  last_slot_end_at: string | null;
  venue_city: string | null;
  hero: string | null;
  slots_count: number;
  tickets_sold: number;
  revenue_cents: number;
  public_url: string;
}

export interface EventBookingTicket {
  id: number;
  ticket_type_id: number;
  label: string;
  unit_price_cents: number;
  first_name: string | null;
  age: number | null;
  role: TicketRole;
  checked_in_at: string | null;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';
export type BookingSource = 'online' | 'manual_onsite' | 'manual_invoice' | 'manual_free';
export type PaymentStatus = 'none' | 'paid' | 'partially_refunded' | 'refunded' | 'offline_due' | 'offline_paid' | 'free';

export interface EventBooking {
  id: number;
  reference: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: BookingSource;
  slot_id: number;
  slot_starts_at: string | null;
  team_name: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_name: string;
  buyer_email: string | null;
  buyer_phone: string | null;
  language: string;
  tickets: EventBookingTicket[];
  addons: { variant_id: number; qty: number; unit_price_cents: number; label: string }[];
  subtotal_cents: number;
  discount_cents: number;
  booking_fee_cents: number;
  total_cents: number;
  refunded_cents: number;
  fee_refunded_cents: number;
  refundable_cents: number;
  disputed: boolean;
  internal_notes: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  anonymised: boolean;
}

export interface EventBookingDetail extends EventBooking {
  answers: { question_id: number; label: string; kind: QuestionKind; value: string | null; display: string | null }[];
  refunds: { amount_cents: number; fee_refunded_cents: number; reason: string | null; initiated_by: string; created_at: string | null }[];
  consents: Record<string, unknown> | null;
  log: { type: string; actor_type: string | null; data: Record<string, unknown> | null; created_at: string | null }[];
  promo_code: string | null;
  manage_url: string;
}

export interface ManualBookingInput {
  slot_id: number;
  source: 'manual_onsite' | 'manual_invoice' | 'manual_free';
  paid: boolean;
  send_email: boolean;
  notes: string;
  lang?: string;
  tickets: { ticket_type_id: number; first_name?: string; age?: number | null }[];
  team_name: string;
  buyer: { first_name: string; last_name: string; email: string; phone: string };
  addons: { variant_id: number; qty: number }[];
}

export interface BookingUpdateInput {
  team_name?: string | null;
  buyer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  tickets?: { first_name: string | null; age: number | null }[];
  internal_notes?: string | null;
  payment_status?: 'offline_due' | 'offline_paid';
}

export type UploadKind = 'hero' | 'logo' | 'partner' | 'step' | 'terms_pdf' | 'addon';

export function emptyContent(): EventContent {
  return {
    title: '', subtitle: '', date_text: '', cta_label: '', description_md: '',
    practical: { hours: '', ages: '', info_md: '' },
    steps: [], testimonials: [], faq: [], terms_text_md: '', seo_description: '',
  };
}

// ── Phase 4: event day ─────────────────────────────────────────────────

export interface StaffLink {
  id: number;
  label: string | null;
  url: string;
  revoked: boolean;
  locked: boolean;
  last_used_at: string | null;
  created_at: string | null;
}
