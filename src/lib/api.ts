import { CardsConflictError } from './cardsApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface User {
  id: number;
  email: string;
  name?: string;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

export const phpAuthApi = {
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; message: string }>> {
    return apiRequest('/auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<ApiResponse<{ message: string }>> {
    return apiRequest('/auth.php?action=logout', {
      method: 'POST',
    });
  },

  async checkAuth(): Promise<ApiResponse<{ user: User | null }>> {
    return apiRequest('/auth.php?action=check', {
      method: 'GET',
    });
  },
};

export interface MediaFile {
  id: string;
  name: string;
  scenario_uniqid: string;
  path: string;
  url: string;
  size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  game_type: string;
  uniqid: string;
  created_at: string;
  updated_at: string;
}

export const mediaApi = {
  async listMedia(): Promise<ApiResponse<{ media: MediaFile[] }>> {
    return apiRequest('/media.php?action=list', {
      method: 'GET',
    });
  },

  async getMedia(uniqid: string, filename: string): Promise<ApiResponse<{ media: MediaFile }>> {
    return apiRequest(`/media.php?action=get&uniqid=${encodeURIComponent(uniqid)}&filename=${encodeURIComponent(filename)}`, {
      method: 'GET',
    });
  },

  async getMediaScenarios(uniqid: string): Promise<ApiResponse<{ scenarios: Scenario[] }>> {
    return apiRequest(`/media.php?action=scenarios&uniqid=${encodeURIComponent(uniqid)}`, {
      method: 'GET',
    });
  },

  async deleteMedia(uniqid: string, filename: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return apiRequest('/media.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ uniqid, filename }),
    });
  },
};

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminData {
  email: string;
  password: string;
  name?: string;
}

export interface UpdateAdminData {
  id: string;
  email?: string;
  password?: string;
  name?: string;
}

export const adminUsersApi = {
  async getAdminUsers(): Promise<ApiResponse<{ admins: AdminUser[] }>> {
    return apiRequest('/admin_users.php?action=list', {
      method: 'GET',
    });
  },

  async createAdminUser(data: CreateAdminData): Promise<ApiResponse<{ admin: AdminUser }>> {
    return apiRequest('/admin_users.php?action=create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminUser(data: UpdateAdminData): Promise<ApiResponse<{ admin: AdminUser }>> {
    return apiRequest('/admin_users.php?action=update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminUser(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest('/admin_users.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

export interface ScenarioData {
  id: string;
  client_id?: number;
  title: string;
  description: string;
  game_data?: string;
  game_type?: string;
  scenario_type?: string;
  status?: string;
  uniqid: string;
  created_at: string;
  updated_at?: string;
  creator_name?: string;
  client_name?: string;
  client_email?: string;
}

export const scenariosApi = {
  async listScenarios(clientId?: string): Promise<ApiResponse<{ scenarios: ScenarioData[] }>> {
    const url = clientId
      ? `/scenarios.php?action=list&client_id=${encodeURIComponent(clientId)}`
      : '/scenarios.php?action=list';
    return apiRequest(url, {
      method: 'GET',
    });
  },

  async getScenario(id: string): Promise<ApiResponse<{ scenario: ScenarioData }>> {
    return apiRequest(`/scenarios.php?action=get&id=${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  async deleteScenario(id: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return apiRequest('/scenarios.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

export interface DashboardStats {
  clients: number;
  scenarios: number;
  storage: {
    bytes: number;
    formatted: string;
  };
  api_requests: {
    total: number;
    percent_change: number;
  };
}

export interface DashboardActivity {
  type: string;
  icon: string;
  title: string;
  detail: string;
  time: string;
}

export const dashboardApi = {
  async getStats(): Promise<ApiResponse<DashboardStats>> {
    return apiRequest('/dashboard.php?action=stats', {
      method: 'GET',
    });
  },

  async getRecentActivity(limit: number = 10): Promise<ApiResponse<{ activities: DashboardActivity[] }>> {
    return apiRequest(`/dashboard.php?action=recent-activity&limit=${limit}`, {
      method: 'GET',
    });
  },
};

// Row-based admin cards endpoints. These THROW on error so that 409
// conflicts can surface their error_code via CardsConflictError; the rest
// of the admin API uses ApiResponse<T>. The legacy CSV-based admin
// endpoints were retired in Unit 7.

export const adminCardsApi = {
  async listAllDb(): Promise<ClientCardSummary[]> {
    const body = await adminCardsThrowingRequest<{ success: boolean; data: ClientCardSummary[] }>(
      'admin_list_all_db'
    );
    return body.data;
  },

  async listCards(clientId: number): Promise<{ cards: AdminCardRow[]; version: number }> {
    return adminCardsThrowingRequest(`admin_list_cards&client_id=${clientId}`);
  },

  async createCard(clientId: number, card: AdminNewCardInput): Promise<{ version: number }> {
    return adminCardsThrowingRequest('admin_create_card', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, ...card }),
    });
  },

  async updateCard(
    clientId: number,
    id: number,
    fields: AdminCardUpdateInput
  ): Promise<{ version: number }> {
    return adminCardsThrowingRequest('admin_update_card', {
      method: 'PUT',
      body: JSON.stringify({ client_id: clientId, id, ...fields }),
    });
  },

  async deleteCard(clientId: number, id: number): Promise<{ version: number }> {
    return adminCardsThrowingRequest(
      `admin_delete_card&client_id=${clientId}&id=${id}`,
      { method: 'DELETE' }
    );
  },

  async importCsv(clientId: number, file: File): Promise<AdminImportCsvResponse> {
    const formData = new FormData();
    formData.append('client_id', String(clientId));
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/cards.php?action=admin_import_csv`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `import failed (${response.status})`);
    }
    return data as AdminImportCsvResponse;
  },
};

async function adminCardsThrowingRequest<T>(action: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/cards.php?action=${action}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409 && body.error_code) {
    throw new CardsConflictError(body.error_code, body.error || body.error_code);
  }
  if (!response.ok) {
    throw new Error(body.error || `${action} failed (${response.status})`);
  }
  return body as T;
}

export interface AdminCardRow {
  id: number;
  key_number: number;
  key_name: string;
  color: string | null;
}

export interface AdminNewCardInput {
  id: number;
  key_number: number;
  key_name: string;
  color?: string | null;
}

export interface AdminCardUpdateInput {
  key_number?: number;
  key_name?: string;
  color?: string | null;
}

export interface ClientCardSummary {
  id: number;
  email: string;
  name: string;
  version: number | null;
  created_at: string | null;
  updated_at: string | null;
  card_count: number;
}

export interface AdminImportCsvResponse {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  version: number;
}

export interface OnDemandPoolCard {
  id: string;
  key_name: string;
  color: string;
  key_number: string;
  card_id: string;
  pool_version: number;
  created_at: string;
}

export interface OnDemandPoolMeta {
  current_version: number;
  card_count: number;
  updated_at: string | null;
}

export interface ClientOnDemandCard {
  id: string;
  pool_card_id: string;
  end_date: string | null;
  assigned_at: string;
  assigned_by: string | null;
  key_name: string;
  color: string;
  key_number: string;
  card_id: string;
}

export const onDemandCardsApi = {
  async getPoolMeta(): Promise<ApiResponse<{ data: OnDemandPoolMeta }>> {
    return apiRequest('/on_demand_cards.php?action=get_pool_meta', { method: 'GET' });
  },

  async uploadPool(file: File): Promise<ApiResponse<{ success: boolean; version: number; count: number }>> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/on_demand_cards.php?action=upload_pool`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || 'Upload failed' };
    return { data };
  },

  async getPool(): Promise<ApiResponse<{ data: OnDemandPoolCard[]; version: number }>> {
    return apiRequest('/on_demand_cards.php?action=get_pool', { method: 'GET' });
  },

  async getClientAssignments(clientId: number): Promise<ApiResponse<{ data: ClientOnDemandCard[] }>> {
    return apiRequest(`/on_demand_cards.php?action=get_client_assignments&client_id=${clientId}`, { method: 'GET' });
  },

  async assignCards(clientId: number, poolCardIds: string[], endDate: string | null): Promise<ApiResponse<{ success: boolean; assigned: number; skipped: number }>> {
    return apiRequest('/on_demand_cards.php?action=assign_cards', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, pool_card_ids: poolCardIds, end_date: endDate }),
    });
  },

  async removeAssignment(assignmentId: string): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest('/on_demand_cards.php?action=remove_assignment', {
      method: 'POST',
      body: JSON.stringify({ assignment_id: assignmentId }),
    });
  },

  async removeAllAssignments(clientId: number): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest('/on_demand_cards.php?action=remove_all_assignments', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId }),
    });
  },
};

// Team-name pools: curated fun team names by audience (mini_kids/kids/ado_adultes) x
// language. `scope` is 'global' (admin catalog, everyone gets it) or a numeric
// client_id (that client's private pool). The playground draws a name from the
// merged (global ∪ client) set at team creation. See team_name_pools.php.
// Canonical audience trio - mirrors src/types/audience.ts (game_meta.game_public).
export type TeamNameAudience = 'mini_kids' | 'kids' | 'ado_adultes';

export type TeamNamePoolScope = 'global' | number;

export interface TeamNamePoolEntry {
  id: string;
  name: string;
}

// pools[audience][language] -> entries. Keys present only where names exist.
export type TeamNamePools = Partial<Record<TeamNameAudience, Record<string, TeamNamePoolEntry[]>>>;

export interface TeamNamePoolMeta {
  current_version: number;
  counts: Partial<Record<TeamNameAudience, Record<string, number>>>;
  updated_at: string | null;
}

function teamNamePoolScopeParam(scope: TeamNamePoolScope): string {
  return scope === 'global' ? 'global' : String(scope);
}

export const teamNamePoolsApi = {
  async getPoolMeta(scope: TeamNamePoolScope): Promise<ApiResponse<{ data: TeamNamePoolMeta }>> {
    return apiRequest(`/team_name_pools.php?action=get_pool_meta&scope=${teamNamePoolScopeParam(scope)}`, { method: 'GET' });
  },

  async getPool(scope: TeamNamePoolScope): Promise<ApiResponse<{ pools: TeamNamePools; version: number }>> {
    return apiRequest(`/team_name_pools.php?action=get_pool&scope=${teamNamePoolScopeParam(scope)}`, { method: 'GET' });
  },

  async addNames(
    scope: TeamNamePoolScope,
    audience: TeamNameAudience,
    language: string,
    names: string[],
  ): Promise<ApiResponse<{ success: boolean; added: number; skipped: number; version: number }>> {
    return apiRequest('/team_name_pools.php?action=add_names', {
      method: 'POST',
      body: JSON.stringify({ scope: teamNamePoolScopeParam(scope), audience, language, names }),
    });
  },

  async deleteNames(
    scope: TeamNamePoolScope,
    ids: string[],
  ): Promise<ApiResponse<{ success: boolean; deleted: number; version: number }>> {
    return apiRequest('/team_name_pools.php?action=delete_names', {
      method: 'POST',
      body: JSON.stringify({ scope: teamNamePoolScopeParam(scope), ids }),
    });
  },

  async uploadCsv(
    scope: TeamNamePoolScope,
    file: File,
  ): Promise<ApiResponse<{ success: boolean; added: number; skipped: number; version: number }>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scope', teamNamePoolScopeParam(scope));
    const response = await fetch(`${API_BASE_URL}/team_name_pools.php?action=upload_csv`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || 'Upload failed' };
    return { data };
  },
};

// Offline PIN-recovery codes (per-client). The admin issues a pool here; codes
// sync to the client's playground devices and are validated offline. See
// backend/api/recovery_codes.php.
export interface RecoveryCodeEntry {
  code_index: number;
  code: string;
  used_at: string | null;
  used_device_label: string | null;
  // Which gate burned the code: 'pin' (forgot-PIN) | 'billing' (device-lock
  // reprieve) | null (legacy/unknown). project_client_device_lock.
  used_context?: 'pin' | 'billing' | null;
}

export interface RecoveryCodePool {
  success: boolean;
  version: number;
  pool_size: number;
  codes: RecoveryCodeEntry[];
}

export const recoveryCodesApi = {
  async getPool(clientId: number): Promise<ApiResponse<RecoveryCodePool>> {
    return apiRequest(`/recovery_codes.php?action=get_pool&client_id=${clientId}`, { method: 'GET' });
  },

  async regenerate(clientId: number): Promise<ApiResponse<RecoveryCodePool>> {
    return apiRequest('/recovery_codes.php?action=regenerate', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId }),
    });
  },
};

// Mission-report PDF layout defaults (the "PDF editor"). Global, admin-owned;
// one layout per game type, synced to playground. See backend/api/report_layouts.php.
export type ReportBlockType =
  | 'logo' | 'game_title' | 'pdf_title' | 'team_name' | 'date'
  | 'duration' | 'score' | 'rank' | 'stat_grid' | 'text'
  // Structural blocks: `divider`/`spacer` are leaves; `row`/`frame` are
  // containers that hold other blocks in `children`.
  | 'divider' | 'spacer' | 'row' | 'frame';

export interface ReportBlock {
  type: ReportBlockType;
  show: boolean;
  font?: string | null;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  fields?: string[];
  text?: string;
  logoSize?: number;
  /** `divider` - line thickness in px (default 1). */
  thickness?: number;
  /** `divider` - line width as a % of the page (default 70). */
  width?: number;
  /** `spacer` - vertical gap height in px. */
  height?: number;
  /** `row` - horizontal gap between children in px (default 16). */
  gap?: number;
  /** `row` - horizontal distribution of children. */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** `frame` - draw a border (default true). */
  bordered?: boolean;
  /** `frame` - border color (default #333333). */
  borderColor?: string;
  /** `frame` - background fill; empty/absent ⇒ transparent. */
  bgColor?: string;
  /** `frame` - inner padding in px (default 12). */
  padding?: number;
  /** `frame` - corner radius in px. */
  radius?: number;
  /** `row` / `frame` - nested blocks. */
  children?: ReportBlock[];
}

export interface ReportLayout {
  version: number;
  font: string;
  background: { mode: 'none' | 'color'; color?: string };
  blocks: ReportBlock[];
  /**
   * Per-game-type default report texts. The mission-report heading (the
   * "pdf_title" block) and the label above the team name (the "team_name"
   * block). A scenario can override these via game_meta.pdf_title /
   * game_meta.team_title; a blank scenario value falls back to these.
   */
  pdfTitle?: string;
  teamTitle?: string;
  /**
   * Optional literal overrides for the standard block labels, keyed by label id
   * (`date`, `duration`, `score`, `rank`, and `stat_<field>` e.g. `stat_rate`).
   * Blank / absent ⇒ the playground falls back to its built-in `report` i18n
   * label, translated into each team's language at print time. A non-blank value
   * is printed verbatim in every language.
   */
  labels?: Record<string, string>;
}

export interface ReportLayoutsResponse {
  success: boolean;
  version: number;
  game_types: string[];
  stat_fields: Record<string, string[]>;
  layouts: Record<string, ReportLayout>;
  /** Admin-defined default print format; null when never set. */
  print_format: ReportPrintFormat | null;
}

// Default physical output format pushed to playgrounds (a device's local
// Settings → Printing choice wins). Mirrors playground printPrefsStore.
export interface ReportPrintFormat {
  paper: 'ticket_100x150' | 'a4' | 'a5' | 'a6' | 'custom';
  customMm: { width: number; height: number };
  orientation: 'portrait' | 'landscape';
}

// Admin auth is token-based (secure_auth.php sets no PHP session), so these
// calls must carry the X-Auth-Token header; report_layouts.php bridges it.
function adminAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('auth_token');
    return token ? { 'X-Auth-Token': token } : {};
  } catch {
    return {};
  }
}

export const reportLayoutsApi = {
  async getAll(): Promise<ApiResponse<ReportLayoutsResponse>> {
    return apiRequest('/report_layouts.php?action=get_all', { method: 'GET', headers: adminAuthHeaders() });
  },

  async save(gameType: string, layout: ReportLayout): Promise<ApiResponse<{ success: boolean; version: number }>> {
    return apiRequest('/report_layouts.php?action=save', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ game_type: gameType, layout }),
    });
  },

  async reset(gameType: string): Promise<ApiResponse<{ success: boolean; version: number; layout: ReportLayout }>> {
    return apiRequest('/report_layouts.php?action=reset', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ game_type: gameType }),
    });
  },

  async savePrintFormat(printFormat: ReportPrintFormat): Promise<ApiResponse<{ success: boolean; version: number; print_format: ReportPrintFormat }>> {
    return apiRequest('/report_layouts.php?action=save_print_format', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ print_format: printFormat }),
    });
  },
};

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

export interface ImportCreatedRow {
  slug: string;
  uniqid: string;
  title: string;
  id: number;
  game_type: string;
  media_count: number;
}

export interface ImportSkippedRow {
  slug: string;
  uniqid: string;
  reason: string;
  existing_id?: number;
}

export interface ImportFailedRow {
  slug: string;
  error: string;
}

export interface ImportResult {
  success: boolean;
  summary: ImportSummary;
  created: ImportCreatedRow[];
  skipped: ImportSkippedRow[];
  failed: ImportFailedRow[];
}

export const scenarioImportApi = {
  async importZip(
    file: File,
    ownership: 'product' | 'client',
    clientId: number | null
  ): Promise<ApiResponse<ImportResult>> {
    const fd = new FormData();
    fd.append('zip_file', file);
    fd.append('ownership', ownership);
    if (ownership === 'client' && clientId !== null) {
      fd.append('client_id', String(clientId));
    }
    const token = (() => {
      try { return localStorage.getItem('auth_token') || ''; } catch { return ''; }
    })();
    try {
      const response = await fetch(`${API_BASE_URL}/scenario_import.php?action=import`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'X-Auth-Token': token } : {},
        body: fd,
      });
      const data = await response.json();
      if (!response.ok) return { error: data.error || 'Import failed' };
      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  },
};
