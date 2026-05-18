export type ScenarioStatus = 'draft' | 'published' | 'archived';
export type ScenarioType = 'product' | 'custom';

export type ScenarioJsonField = string | Record<string, unknown> | null;
export type ScenarioLayoutField = string | unknown[] | null;

export interface Scenario {
  id: string;
  uniqid: string;
  title: string;
  description: string;
  game_type?: string;
  scenario_type?: ScenarioType | string;
  status?: ScenarioStatus | string;
  version?: string;
  slug?: string;
  data?: ScenarioJsonField;
  medias?: ScenarioJsonField;
  scenario_layout?: ScenarioLayoutField;
  client_id?: number | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}
