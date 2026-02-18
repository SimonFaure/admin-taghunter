export interface ClientScenario {
  id: string;
  title: string;
  description: string;
  uniqid: string;
  game_type?: string;
  scenario_type?: string;
  version?: string;
  granted_at?: string;
  granted_by_email?: string;
  medias?: string | Record<string, unknown>;
  media_url?: string;
  has_zip_files?: boolean;
  files_count?: number;
}
