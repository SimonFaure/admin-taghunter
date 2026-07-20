import { secureAuth } from './secureAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface Device {
  id: number;
  client_id: string;
  playground_version: string;
  cards_file_version: number;
  device_uniq: string;
  device_label: string | null;
  display_name: string | null;
  // Inventory bit set during first-launch onboarding (or the playground's
  // Network settings tab): this machine is the client's canonical mother / game
  // server. No secret is stored - see playground first-launch onboarding.
  is_default_mother?: number;
  mother_uuid?: string | null;
  created_at: string;
  updated_at: string;
}

// A client's studio-authored Wi-Fi hotspot. Studio is the sole author; playground
// devices pull these on sync and raise them when becoming the mother. The client's
// own dashboard view (client-auth) includes the password so it can render a join
// QR for phones - but only admins can edit it.
export interface LanNetwork {
  id: number;
  ssid: string;
  password?: string;
  source: string;
  is_default: number;
  updated_at: string;
}

// Admin-side single primary hotspot for a client (clients.php?action=hotspot_*).
export interface ClientHotspot {
  ssid: string;
  password: string;
  source: string;
  version: number;
  updated_at?: string;
}

// Standard WIFI: QR payload so a phone camera can join the AP (WPA2). Special
// chars are escaped per the spec, matching the playground's wifiQrPayload.
export function wifiQrPayload(ssid: string, password: string): string {
  const esc = (s: string) => s.replace(/([\\;,":])/g, '\\$1');
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`;
}

function getAuthHeaders(): HeadersInit {
  const token = secureAuth.getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  return headers;
}

export async function getDevices(): Promise<Device[]> {
  const response = await fetch(`${API_BASE_URL}/devices.php?action=list`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch devices');
  }

  const result = await response.json();
  return result.data || [];
}

// The client's announced default Wi-Fi hotspots (read-only dashboard view).
export async function getLanNetworks(): Promise<LanNetwork[]> {
  const response = await fetch(`${API_BASE_URL}/devices.php?action=lan_networks`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch hotspots');
  }

  const result = await response.json();
  return result.data || [];
}

// ─── Admin-only client hotspot management (clients.php) ──────────────────────
// These manage the single primary hotspot for a given client by id. Admin-auth
// (X-Auth-Token). Editing bumps the version so playground devices re-pull on
// next sync; the change applies at the next fresh mother start, never mid-game.

export async function getClientHotspot(clientId: number): Promise<ClientHotspot | null> {
  const response = await fetch(`${API_BASE_URL}/clients.php?action=hotspot_get&id=${clientId}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch hotspot');
  }
  const result = await response.json();
  return result.data || null;
}

export async function updateClientHotspot(data: {
  clientId: number;
  ssid?: string;
  password?: string;
  regeneratePassword?: boolean;
}): Promise<ClientHotspot> {
  const response = await fetch(`${API_BASE_URL}/clients.php?action=hotspot_update`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      id: data.clientId,
      ssid: data.ssid,
      password: data.password,
      regenerate_password: data.regeneratePassword ?? false,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update hotspot');
  }
  const result = await response.json();
  return result.data;
}

export async function registerDevice(data: {
  device_uniq: string;
  playground_version?: string;
  cards_file_version?: number;
}): Promise<{ id: number }> {
  const response = await fetch(`${API_BASE_URL}/devices.php?action=register`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to register device');
  }

  const result = await response.json();
  return { id: result.id };
}

export async function updateDevice(data: {
  device_uniq: string;
  playground_version?: string;
  cards_file_version?: number;
  display_name?: string | null;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/devices.php?action=update`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update device');
  }
}

export async function deleteDevice(deviceUniq: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/devices.php?action=delete&device_uniq=${encodeURIComponent(deviceUniq)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete device');
  }
}
