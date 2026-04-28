import { Client, CreateClientData, UpdateClientData } from '../types/client';
import { authFetch } from './authFetch';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

async function phpFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return { error: result.error || 'Request failed' };
    }

    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

export const clientApi = {
  async getClients(): Promise<ApiResponse<Client[]>> {
    return phpFetch<Client[]>('/clients.php?action=list');
  },

  async getClient(id: string): Promise<ApiResponse<Client>> {
    return phpFetch<Client>(`/clients.php?action=get&id=${id}`);
  },

  async createClient(clientData: CreateClientData): Promise<ApiResponse<Client>> {
    return phpFetch<Client>('/clients.php?action=create', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  async updateClient(clientData: UpdateClientData): Promise<ApiResponse<Client>> {
    return phpFetch<Client>('/clients.php?action=update', {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  },

  async deleteClient(id: string): Promise<ApiResponse<void>> {
    return phpFetch<void>(`/clients.php?action=delete&id=${id}`, {
      method: 'DELETE',
    });
  },

  async checkEmailExists(email: string): Promise<ApiResponse<{ exists: boolean; is_admin?: boolean; client_id?: number; admin_id?: number }>> {
    return phpFetch<{ exists: boolean; is_admin?: boolean; client_id?: number; admin_id?: number }>(
      `/check_email.php?email=${encodeURIComponent(email)}`,
    );
  },

  async changePassword(clientId: string, newPassword: string): Promise<ApiResponse<void>> {
    return phpFetch<void>('/clients.php?action=change_password', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, new_password: newPassword }),
    });
  },
};
