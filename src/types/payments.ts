// Events phase 1: licensee payments setup (backend/api/payments.php) and the
// admin Events settings (backend/api/events_admin.php).

export type VatRegime = 'subject' | 'exempt';

export interface LegalInfo {
  legal_name: string | null;
  legal_form: string | null;
  siret: string | null;
  vat_number: string | null;
  vat_regime: VatRegime;
  vat_default_bp: number;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  legal_email: string | null;
  public_phone: string | null;
  vat_valid?: boolean | null;
  vat_checked_at?: string | null;
}

export type StripeState =
  | 'none'
  | 'onboarding_incomplete'
  | 'pending_verification'
  | 'action_needed'
  | 'active'
  | 'disconnected';

export interface StripeStatus {
  configured: boolean;
  connected: boolean;
  state: StripeState;
  account_id?: string;
  livemode?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  disabled_reason?: string | null;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
    current_deadline: number | null;
  } | null;
  disconnected_at?: string | null;
  updated_at?: string;
}

export interface Commission {
  bp: number;
  fixed_cents: number;
  custom: boolean;
}

export interface PaymentsStatus {
  events_enabled: boolean;
  legal: LegalInfo;
  /** Field keys still missing before Stripe can be connected; 'terms' = platform terms not accepted. */
  missing: string[];
  slug: string | null;
  terms: { required_version: string; url: string; accepted_version: string | null; accepted_at: string | null; accepted: boolean };
  commission: Commission;
  stripe: StripeStatus;
  countries: string[];
}

/** Field -> error code (translated in payments.json `errors.*`). */
export type FieldErrors = Record<string, string>;

export interface EventsPlatformSettings {
  commission_bp_default: number;
  commission_fixed_cents_default: number;
  platform_terms_version: string;
  platform_terms_url: string;
  invoice_series_prefix: string;
  invoice_issuer: Record<string, string>;
  stripe_configured: boolean;
  stripe_live: boolean;
  mailjet_configured: boolean;
}

export interface AdminLicenseeEvents {
  client_id: number;
  events_enabled: boolean;
  commission_bp: number | null;
  commission_fixed_cents: number | null;
  commission: Commission;
  slug: string | null;
  legal: LegalInfo;
  missing: string[];
  terms_version: string | null;
  terms_accepted_at: string | null;
  stripe: StripeStatus;
  sales_gate: string | null;
}

// Phase 3: monthly commission invoices (EventsInvoices::toApi) + admin revenue.
export interface CommissionInvoice {
  id: number;
  number: string;
  kind: 'invoice' | 'credit_note';
  period_start: string;
  period_end: string;
  fees_ttc_cents: number;
  ht_cents: number;
  vat_cents: number;
  vat_scheme: 'fr' | 'eu_reverse' | string;
  bookings_count: number;
  issued_at: string;
  client_id: number;
  /** admin listing only */
  licensee?: string;
}

export interface RevenueRow {
  client_id: number;
  licensee: string;
  month: string; // 'YYYY-MM'
  bookings: number;
  gmv_cents: number;
  fees_cents: number;
  refunded_cents: number;
  fees_refunded_cents: number;
}
