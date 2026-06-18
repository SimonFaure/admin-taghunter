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
  // server. No secret is stored — see playground first-launch onboarding.
  is_default_mother?: number;
  mother_uuid?: string | null;
  created_at: string;
  updated_at: string;
}

// A relayed default Wi-Fi hotspot announced by one of the client's devices.
// Sibling playground devices download these to auto-join. Hotspot creds only;
// the password is never surfaced here.
export interface LanNetwork {
  id: number;
  ssid: string;
  source: string;
  is_default: number;
  device_label: string | null;
  updated_at: string;
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
