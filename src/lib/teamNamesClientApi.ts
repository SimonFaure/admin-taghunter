import { secureAuth } from './secureAuth';
import type { TeamNameAudience, TeamNamePools } from './api';

// Client-portal access to the team-name pools. Unlike the admin
// `teamNamePoolsApi` (which uses the admin session cookie + an arbitrary
// `scope`), every call here is gated by the client's X-Auth-Token and the
// server forces the scope to the authenticated client. The client can read the
// read-only global catalog and add/remove only its OWN names.
// See backend/api/team_name_pools.php (client_* actions).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface TeamNamePoolPayload {
  version: number;
  pools: TeamNamePools;
  counts: Partial<Record<TeamNameAudience, Record<string, number>>>;
}

async function request<T>(action: string, init: RequestInit = {}): Promise<T> {
  const token = secureAuth.getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['X-Auth-Token'] = token;

  const response = await fetch(`${API_BASE_URL}/team_name_pools.php?action=${action}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `team_name_pools ${action} failed (${response.status})`);
  }
  return body as T;
}

export const teamNamesClientApi = {
  // Read-only default catalog (global scope).
  getCatalog(): Promise<TeamNamePoolPayload> {
    return request<TeamNamePoolPayload>('client_get_catalog', { method: 'GET' });
  },

  // The client's own additions.
  getMyPool(): Promise<TeamNamePoolPayload> {
    return request<TeamNamePoolPayload>('client_get_pool', { method: 'GET' });
  },

  addNames(
    audience: TeamNameAudience,
    language: string,
    names: string[],
  ): Promise<{ success: boolean; added: number; skipped: number; version: number }> {
    return request('client_add_names', {
      method: 'POST',
      body: JSON.stringify({ audience, language, names }),
    });
  },

  deleteNames(ids: string[]): Promise<{ success: boolean; deleted: number; version: number }> {
    return request('client_delete_names', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async uploadCsv(file: File): Promise<{ success: boolean; added: number; skipped: number; version: number }> {
    const token = secureAuth.getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['X-Auth-Token'] = token;
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/team_name_pools.php?action=client_upload_csv`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Upload failed');
    return body;
  },
};
