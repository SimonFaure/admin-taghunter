import type { Scenario } from '../../types/scenario';

export type { Scenario } from '../../types/scenario';

export interface ClientScenario extends Scenario {
  granted_at?: string;
  granted_by_email?: string;
  has_zip_files?: boolean;
  files_count?: number;
}
