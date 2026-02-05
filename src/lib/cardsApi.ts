import { secureAuth } from './secureAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface CardsMetadata {
  id: number;
  client_id: number;
  version: number;
  created_at: string;
  updated_at: string;
  has_file: boolean;
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

export async function getCardsMetadata(): Promise<CardsMetadata | null> {
  const url = `${API_BASE_URL}/cards.php?action=get_metadata`;
  const headers = getAuthHeaders();

  console.log('[cardsApi] getCardsMetadata - URL:', url);
  console.log('[cardsApi] getCardsMetadata - Headers:', headers);

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  console.log('[cardsApi] getCardsMetadata - Response status:', response.status, response.statusText);
  console.log('[cardsApi] getCardsMetadata - Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const error = await response.json();
    console.error('[cardsApi] getCardsMetadata - Error:', error);
    throw new Error(error.error || 'Failed to fetch cards metadata');
  }

  const result = await response.json();
  console.log('[cardsApi] getCardsMetadata - Result:', result);
  return result.data;
}

export async function uploadCardsFile(file: File): Promise<{ version: number }> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV files are allowed');
  }

  const formData = new FormData();
  formData.append('file', file);

  const token = secureAuth.getStoredToken();
  const headers: HeadersInit = {};

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  const response = await fetch(`${API_BASE_URL}/cards.php?action=upload`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload cards file');
  }

  const result = await response.json();
  return { version: result.version };
}

export async function downloadCardsFile(): Promise<Blob> {
  const token = secureAuth.getStoredToken();
  const headers: HeadersInit = {};

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  const response = await fetch(`${API_BASE_URL}/cards.php?action=download`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to download cards file');
  }

  return response.blob();
}

export async function deleteCardsFile(): Promise<void> {
  const token = secureAuth.getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  const response = await fetch(`${API_BASE_URL}/cards.php?action=delete`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete cards file');
  }
}

export interface CardData {
  [key: string]: string;
}

export interface CardsDataResponse {
  success: boolean;
  data: CardData[];
  headers: string[];
  count: number;
}

export async function getCardsData(): Promise<CardsDataResponse | null> {
  const url = `${API_BASE_URL}/cards.php?action=get_data`;
  const headers = getAuthHeaders();

  console.log('[cardsApi] getCardsData - URL:', url);
  console.log('[cardsApi] getCardsData - Headers:', headers);

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  console.log('[cardsApi] getCardsData - Response status:', response.status, response.statusText);
  console.log('[cardsApi] getCardsData - Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    if (response.status === 404) {
      console.log('[cardsApi] getCardsData - No file found (404)');
      return null;
    }
    const error = await response.json();
    console.error('[cardsApi] getCardsData - Error:', error);
    throw new Error(error.error || 'Failed to fetch cards data');
  }

  const result = await response.json();
  console.log('[cardsApi] getCardsData - Result:', result);
  return result;
}
