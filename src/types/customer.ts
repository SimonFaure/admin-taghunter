// Licensee customers ("Clients" in the FR UI): the licensee's OWN customers
// (companies, schools...). NOT the licensee itself, which the code calls
// "client". Backend: backend/api/customers.php.

/** A code from the admin-managed customer types (lib/customerTypesApi). */
export type CustomerType = string;

export interface Customer {
  id: string;
  name: string;
  type: CustomerType | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  archived: boolean;
  created_source: 'studio' | 'playground' | 'import';
  created_at: string;
  updated_at: string;
  games_count: number;
  last_played_at: string | null;
}

export type CustomerInput = Partial<Pick<Customer, 'name' | 'type' | 'contact_name' | 'email' | 'phone' | 'city' | 'notes'>>;

export interface CustomerGame {
  summary_uuid: string;
  name: string | null;
  game_type: string;
  scenario_uniqid: string | null;
  scenario_title: string | null;
  scenario_medias: Record<string, unknown> | null;
  played_at: string | null;
  teams_launched: number | null;
  teams_played: number;
  players_played: number;
  customer_id: string | null;
  customer_name: string | null;
}

/** A game added by hand to a customer's history (not synced from a playground). */
export interface CustomerHistoryEntry {
  id: string;
  customer_id: string;
  /** "YYYY-MM-DD" */
  played_on: string;
  /** played_on at noon UTC, same shape as CustomerGame.played_at. */
  played_at: string;
  scenario_uniqid: string | null;
  scenario_title: string | null;
  scenario_medias: Record<string, unknown> | null;
  /** Free title when the game is not one of the catalog scenarios. */
  title: string | null;
  game_type: string | null;
  teams_count: number | null;
  players_count: number | null;
  notes: string | null;
  created_by: 'client' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface CustomerHistoryEntryInput {
  id?: string;
  customer_id: string;
  played_on: string;
  scenario_uniqid: string | null;
  title: string | null;
  game_type: string | null;
  teams_count: number | null;
  players_count: number | null;
  notes: string | null;
}
