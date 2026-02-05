import { secureAuth } from './secureAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface Device {
  id: number;
  client_id: string;
  playground_version: string;
  cards_file_version: number;
  device_uniq: string;
  created_at: string;
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
