import { supabase } from './supabase';

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

const authMode = import.meta.env.VITE_AUTH_MODE || 'supabase';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

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

export const adminManagementApi = {
  async listAdmins(): Promise<ApiResponse<{ admins: AdminProfile[] }>> {
    if (authMode === 'php') {
      return phpFetch<{ admins: AdminProfile[] }>('/admin_users.php?action=list');
    }

    if (!supabase) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return { error: error.message };
      }

      return { data: { admins: data || [] } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to fetch admins' };
    }
  },

  async createAdmin(email: string, password: string, fullName?: string): Promise<ApiResponse<{ admin: AdminProfile }>> {
    if (authMode === 'php') {
      return phpFetch<{ admin: AdminProfile }>('/admin_users.php?action=create', {
        method: 'POST',
        body: JSON.stringify({ email, password, name: fullName }),
      });
    }

    if (!supabase) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || '',
          },
        },
      });

      if (authError) {
        return { error: authError.message };
      }

      if (!authData.user) {
        return { error: 'Failed to create user' };
      }

      const { data: profileData, error: profileError } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) {
        return { error: profileError.message };
      }

      if (!profileData) {
        return { error: 'Profile was not created' };
      }

      return { data: { admin: profileData } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create admin' };
    }
  },

  async updateAdmin(id: string, email?: string, password?: string, fullName?: string): Promise<ApiResponse<{ admin: AdminProfile }>> {
    if (authMode === 'php') {
      return phpFetch<{ admin: AdminProfile }>('/admin_users.php?action=update', {
        method: 'POST',
        body: JSON.stringify({ id, email, password, name: fullName }),
      });
    }

    if (!supabase) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const updates: any = {};

      if (email) {
        updates.email = email;
      }

      if (password) {
        updates.password = password;
      }

      if (fullName !== undefined) {
        updates.data = { full_name: fullName };
      }

      if (Object.keys(updates).length > 0) {
        const { error: authError } = await supabase.auth.admin.updateUserById(id, updates);

        if (authError) {
          return { error: authError.message };
        }
      }

      if (fullName !== undefined || email) {
        const profileUpdates: any = {};
        if (fullName !== undefined) profileUpdates.full_name = fullName;
        if (email) profileUpdates.email = email;
        profileUpdates.updated_at = new Date().toISOString();

        const { error: profileError } = await supabase
          .from('admin_profiles')
          .update(profileUpdates)
          .eq('id', id);

        if (profileError) {
          return { error: profileError.message };
        }
      }

      const { data: profileData, error: profileError } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (profileError) {
        return { error: profileError.message };
      }

      if (!profileData) {
        return { error: 'Profile not found' };
      }

      return { data: { admin: profileData } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update admin' };
    }
  },

  async deleteAdmin(id: string): Promise<ApiResponse<{ success: boolean }>> {
    if (authMode === 'php') {
      return phpFetch<{ success: boolean }>('/admin_users.php?action=delete', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
    }

    if (!supabase) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const { error: authError } = await supabase.auth.admin.deleteUser(id);

      if (authError) {
        return { error: authError.message };
      }

      return { data: { success: true } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete admin' };
    }
  },
};
