const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface ClientCard {
  id: string;
  client_id: string;
  card_name: string;
  card_type: string;
  card_rarity: string;
  card_power: string;
  card_description: string;
  additional_data: Record<string, any>;
  import_batch: string;
  created_at: string;
  updated_at: string;
}

export async function getClientCards(clientId: string): Promise<ClientCard[]> {
  const response = await fetch(`${API_BASE_URL}/cards.php?action=list`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch cards');
  }

  const result = await response.json();
  return result.data || [];
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export async function importCardsFromCSV(clientId: string, csvData: string): Promise<void> {
  const lines = csvData.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const batchId = crypto.randomUUID();

  const cards = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim());
    if (values.length === 0 || values.every(v => !v)) continue;

    const cardData: any = {
      card_name: '',
      card_type: '',
      card_rarity: '',
      card_power: '',
      card_description: '',
      additional_data: {}
    };

    headers.forEach((header, index) => {
      const value = values[index] || '';
      const lowerHeader = header.toLowerCase();

      if (lowerHeader.includes('name') || lowerHeader === 'card' || lowerHeader === 'title') {
        cardData.card_name = value;
      } else if (lowerHeader.includes('type') || lowerHeader.includes('category')) {
        cardData.card_type = value;
      } else if (lowerHeader.includes('rarity') || lowerHeader.includes('rare')) {
        cardData.card_rarity = value;
      } else if (lowerHeader.includes('power') || lowerHeader.includes('strength') || lowerHeader.includes('attack')) {
        cardData.card_power = value;
      } else if (lowerHeader.includes('description') || lowerHeader.includes('text') || lowerHeader.includes('effect')) {
        cardData.card_description = value;
      } else {
        cardData.additional_data[header] = value;
      }
    });

    cards.push(cardData);
  }

  if (cards.length === 0) {
    throw new Error('No valid card data found in CSV');
  }

  const response = await fetch(`${API_BASE_URL}/cards.php?action=import`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cards, batchId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to import cards');
  }
}

export async function deleteAllClientCards(clientId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cards.php?action=delete_all`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete cards');
  }
}
