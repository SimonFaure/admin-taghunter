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
  // Fine-grained age bands (game_meta.audience_bands) - the taxonomy admin uses.
  // `audience` above stays as the derived name-pool tier shadow.
  audience_bands?: string[];
  // Free-text univers/theme tags (game_meta.univers).
  univers?: string[];
  // Languages the scenario is authored in (data.available_languages/default).
  available_languages?: string[];
  default_language?: string | null;
  // Tag Hunter GO: whether this scenario exists in GO mode (+ answer count).
  adaptable_go?: boolean;
  go_answer_count?: number | null;
  // Tag Hunter Spot: whether this scenario is Spot-capable.
  adaptable_spot?: boolean;
}
