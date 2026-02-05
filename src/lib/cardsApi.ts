const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface CardsMetadata {
  id: number;
  client_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  has_file: boolean;
}

export async function getCardsMetadata(): Promise<CardsMetadata | null> {
  const response = await fetch(`${API_BASE_URL}/cards.php?action=get_metadata`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch cards metadata');
  }

  const result = await response.json();
  return result.data;
}

export async function uploadCardsFile(file: File): Promise<{ version: number }> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV files are allowed');
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/cards.php?action=upload`, {
    method: 'POST',
    credentials: 'include',
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
  const response = await fetch(`${API_BASE_URL}/cards.php?action=download`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to download cards file');
  }

  return response.blob();
}

export async function deleteCardsFile(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cards.php?action=delete`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete cards file');
  }
}
