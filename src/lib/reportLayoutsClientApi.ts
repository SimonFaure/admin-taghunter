import { secureAuth } from './secureAuth';
import type { ReportLayout, ReportPrintFormat } from './api';

// Client-portal access to the mission-report PDF layouts. Unlike the admin
// `reportLayoutsApi` (global defaults), every call here is gated by the
// client's X-Auth-Token and touches only that client's OWN overrides: a saved
// layout wins over the admin default on this client's playgrounds; a reset
// falls back to it. See backend/api/report_layouts.php (client_* actions).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface ClientReportLayoutsPayload {
  version: number;
  game_types: string[];
  stat_fields: Record<string, string[]>;
  /** Per game type: the client's override when present, else the admin default. */
  layouts: Record<string, ReportLayout>;
  /** Per game type: whether this client has its own override. */
  customized: Record<string, boolean>;
  /** The client's own print format; null = inheriting the admin default. */
  print_format: ReportPrintFormat | null;
  /** The admin default it would inherit; null = playground built-in. */
  default_print_format: ReportPrintFormat | null;
}

async function request<T>(action: string, init: RequestInit = {}): Promise<T> {
  const token = secureAuth.getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['X-Auth-Token'] = token;

  const response = await fetch(`${API_BASE_URL}/report_layouts.php?action=${action}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `report_layouts ${action} failed (${response.status})`);
  }
  return body as T;
}

export const reportLayoutsClientApi = {
  getAll(): Promise<ClientReportLayoutsPayload> {
    return request<ClientReportLayoutsPayload>('client_get_all', { method: 'GET' });
  },

  save(gameType: string, layout: ReportLayout): Promise<{ success: boolean; version: number }> {
    return request('client_save', {
      method: 'POST',
      body: JSON.stringify({ game_type: gameType, layout }),
    });
  },

  /** Drop the client's override; returns the admin default now in effect. */
  reset(gameType: string): Promise<{ success: boolean; version: number; layout: ReportLayout }> {
    return request('client_reset', {
      method: 'POST',
      body: JSON.stringify({ game_type: gameType }),
    });
  },

  /** Save the client's own print format; null clears it (back to admin default). */
  savePrintFormat(printFormat: ReportPrintFormat | null): Promise<{ success: boolean; version: number; print_format: ReportPrintFormat | null }> {
    return request('client_save_print_format', {
      method: 'POST',
      body: JSON.stringify({ print_format: printFormat }),
    });
  },
};
