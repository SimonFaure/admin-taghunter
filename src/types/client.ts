export type LicenseType = 'access' | 'premium';

export interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  avatar_url?: string;
  license_type?: LicenseType;
  billing_up_to_date?: boolean;
  language?: string;
  update_channel?: string;
  playground_version?: string;
  creator_version?: string;
  // Per-app provisioning + billing live in the "Client App" admin section
  // (project_client_app_section). Each app has a master {app}_enabled plus an
  // independent overdue_since + grace billing clock.
  //
  // Playground: master = playground_enabled; billing-ok = billing_up_to_date
  // (clock = billing_overdue_since + billing_grace_days); plus the
  // Playground-only extras license_type / update_channel / devices_disabled /
  // billing_reprieve_days.
  playground_enabled?: boolean;
  // Per-client Playground device cap (project_playground_max_devices_admin).
  // Default 4. Enforced at sign-in (cap-reached + eviction flow in secure_auth).
  max_devices?: number;
  // Tag Hunter GO: master = go_enabled (owns the GO product); billing-ok =
  // go_subscription_active (clock = go_billing_overdue_since + go_billing_grace_days).
  // go_subscription_valid_until is retired.
  go_enabled?: boolean;
  go_subscription_active?: boolean;
  go_billing_overdue_since?: string | null;
  go_billing_grace_days?: number;
  // Drop: future app. master = drop_enabled; billing-ok = drop_billing_ok
  // (clock = drop_billing_overdue_since + drop_billing_grace_days). No runtime
  // consumes these yet.
  drop_enabled?: boolean;
  drop_billing_ok?: boolean;
  drop_billing_overdue_since?: string | null;
  drop_billing_grace_days?: number;
  // Emergency device-disable + billing auto-lock (Playground). devices_disabled
  // is the immediate hard switch; billing_overdue_since (server-managed, set when
  // billing flips to Overdue) + billing_grace_days drive the auto-lock; a
  // recovery code grants a per-device reprieve of billing_reprieve_days.
  // See project_client_device_lock.
  devices_disabled?: boolean;
  billing_overdue_since?: string | null;
  billing_grace_days?: number;
  billing_reprieve_days?: number;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

export interface CreateClientData {
  email: string;
  password?: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  avatar_url?: string;
  license_type?: LicenseType;
  billing_up_to_date?: boolean;
  language?: string;
  update_channel?: string;
  playground_version?: string;
  creator_version?: string;
  playground_enabled?: boolean;
  max_devices?: number;
  go_enabled?: boolean;
  go_subscription_active?: boolean;
  go_billing_grace_days?: number;
  drop_enabled?: boolean;
  drop_billing_ok?: boolean;
  drop_billing_grace_days?: number;
  devices_disabled?: boolean;
  billing_grace_days?: number;
  billing_reprieve_days?: number;
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: string;
}
