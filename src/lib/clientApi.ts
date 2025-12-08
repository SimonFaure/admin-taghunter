import { supabase } from './supabase';
import { Client, CreateClientData, UpdateClientData } from '../types/client';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

const authMode = import.meta.env.VITE_AUTH_MODE || 'supabase';
const API_BASE_URL = 'https://admin.taghunter.fr/backend/api';

async function phpFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
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
    if (authMode === 'php') {
      return phpFetch<Client[]>('/clients.php?action=list');
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    return { data: data || [] };
  },

  async getClient(id: string): Promise<ApiResponse<Client>> {
    if (authMode === 'php') {
      return phpFetch<Client>(`/clients.php?action=get&id=${id}`);
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    if (!data) {
      return { error: 'Client not found' };
    }

    return { data };
  },

  async createClient(clientData: CreateClientData): Promise<ApiResponse<Client>> {
    if (authMode === 'php') {
      return phpFetch<Client>('/clients.php?action=create', {
        method: 'POST',
        body: JSON.stringify(clientData),
      });
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('clients')
      .insert([{
        ...clientData,
        created_by: user.id,
      }])
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    return { data };
  },

  async updateClient(clientData: UpdateClientData): Promise<ApiResponse<Client>> {
    if (authMode === 'php') {
      return phpFetch<Client>('/clients.php?action=update', {
        method: 'PUT',
        body: JSON.stringify(clientData),
      });
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { id, ...updates } = clientData;

    const { data, error } = await supabase
      .from('clients')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    return { data };
  },

  async deleteClient(id: string): Promise<ApiResponse<void>> {
    if (authMode === 'php') {
      const result = await phpFetch<void>(`/clients.php?action=delete&id=${id}`, {
        method: 'DELETE',
      });
      return result;
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    return { data: undefined };
  },

  async checkEmailExists(email: string): Promise<ApiResponse<{ exists: boolean; is_admin?: boolean; client_id?: number; admin_id?: number }>> {
    if (authMode === 'php') {
      return phpFetch<{ exists: boolean; is_admin?: boolean; client_id?: number; admin_id?: number }>(`/check_email.php?email=${encodeURIComponent(email)}`);
    }

    if (!supabase) {
      return { error: 'Supabase client not initialized' };
    }

    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (clientError) {
      return { error: clientError.message };
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (adminError) {
      return { error: adminError.message };
    }

    const exists = !!clientData || !!adminData;
    const result: { exists: boolean; is_admin?: boolean; client_id?: number; admin_id?: number } = {
      exists,
      is_admin: !!adminData
    };

    if (clientData) {
      result.client_id = clientData.id;
    }

    if (adminData) {
      result.admin_id = adminData.id;
    }

    return { data: result };
  },
};
