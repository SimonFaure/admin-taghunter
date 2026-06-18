import type { Scenario } from '../../types/scenario';

export type { Scenario } from '../../types/scenario';

export interface ClientScenario extends Scenario {
  granted_at?: string;
  granted_by_email?: string;
  has_zip_files?: boolean;
  files_count?: number;
  // Surfaced by client_scenarios.php list (extracted from game_meta) so the
  // cards/filters can show audience + difficulty without parsing the data blob.
  difficulty?: string | null;
  audience?: string | null;
}
