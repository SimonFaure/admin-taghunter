import { secureAuth } from './secureAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Row-based card CRUD. Replaces the studio's legacy per-client CSV upload/
// download flow (retired in Unit 7). Studio's cards.php exposes these
// endpoints under the same client-token gate that auth.php login mints.

export interface CardRow {
  id: number;
  key_number: number;
  key_name: string;
  color: string | null;
}

export interface NewCardInput {
  id: number;
  key_number: number;
  key_name: string;
  color?: string | null;
}

export interface CardUpdateInput {
  key_number?: number;
  key_name?: string;
  color?: string | null;
}

export interface ListCardsResponse {
  cards: CardRow[];
  version: number;
}

export interface ImportCsvResponse {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  version: number;
}

export class CardsConflictError extends Error {
  constructor(public errorCode: 'card_id_exists' | 'key_number_taken', message: string) {
    super(message);
    this.name = 'CardsConflictError';
  }
}

async function cardsApiRequest<T>(action: string, init: RequestInit = {}): Promise<T> {
  const token = secureAuth.getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['X-Auth-Token'] = token;

  const response = await fetch(`${API_BASE_URL}/cards.php?action=${action}`, {
    credentials: 'include',
    ...init,
    headers,
  });

  const body = await response.json().catch(() => ({}));

  if (response.status === 409 && body.error_code) {
    throw new CardsConflictError(body.error_code, body.error || body.error_code);
  }
  if (!response.ok) {
    throw new Error(body.error || `cards.php ${action} failed (${response.status})`);
  }
  return body as T;
}

export async function listCards(): Promise<ListCardsResponse> {
  return cardsApiRequest<ListCardsResponse>('list_cards', { method: 'GET' });
}

export async function createCard(card: NewCardInput): Promise<{ success: true; card: CardRow; version: number }> {
  return cardsApiRequest('create_card', {
    method: 'POST',
    body: JSON.stringify(card),
  });
}

export async function updateCard(id: number, fields: CardUpdateInput): Promise<{ success: true; version: number }> {
  return cardsApiRequest('update_card', {
    method: 'PUT',
    body: JSON.stringify({ id, ...fields }),
  });
}

export async function deleteCard(id: number): Promise<{ success: true; version: number }> {
  return cardsApiRequest(`delete_card&id=${id}`, { method: 'DELETE' });
}

export async function importCardsCsv(file: File): Promise<ImportCsvResponse> {
  const token = secureAuth.getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers['X-Auth-Token'] = token;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/cards.php?action=import_csv`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `import_csv failed (${response.status})`);
  }
  return body as ImportCsvResponse;
}
