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
// Canonical audience trio — mirrors src/types/audience.ts (game_meta.game_public).
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
