import { supabase } from './supabase';
import { Client, CreateClientData, UpdateClientData } from '../types/client';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export const clientApi = {
  async getClients(): Promise<ApiResponse<Client[]>> {
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
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    return { data: undefined };
  },

  async checkEmailExists(email: string): Promise<ApiResponse<{ exists: boolean }>> {
    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    return { data: { exists: !!data } };
  },
};
