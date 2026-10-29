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
