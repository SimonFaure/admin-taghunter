import { supabase } from './supabase';
import { User } from './api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export const supabaseAuthApi = {
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; message: string }>> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (data.user) {
      return {
        data: {
          user: {
            id: parseInt(data.user.id) || 0,
            email: data.user.email || '',
            name: data.user.user_metadata?.name,
          },
          message: 'Login successful',
        },
      };
    }

    return { error: 'Login failed' };
  },

  async logout(): Promise<ApiResponse<{ message: string }>> {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return { data: { message: 'Logout successful' } };
  },

  async checkAuth(): Promise<ApiResponse<{ user: User | null }>> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session?.user) {
      return { data: { user: null } };
    }

    return {
      data: {
        user: {
          id: parseInt(session.user.id) || 0,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        },
      },
    };
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        callback({
          id: parseInt(session.user.id) || 0,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
      } else {
        callback(null);
      }
    });
  },
};
