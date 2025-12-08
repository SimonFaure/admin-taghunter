const API_BASE_URL = 'https://admin.taghunter.fr/backend/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface User {
  id: number;
  email: string;
  name?: string;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

export const phpAuthApi = {
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; message: string }>> {
    return apiRequest('/auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<ApiResponse<{ message: string }>> {
    return apiRequest('/auth.php?action=logout', {
      method: 'POST',
    });
  },

  async checkAuth(): Promise<ApiResponse<{ user: User | null }>> {
    return apiRequest('/auth.php?action=check', {
      method: 'GET',
    });
  },
};

export interface MediaFile {
  id: string;
  name: string;
  scenario_uniqid: string;
  path: string;
  url: string;
  size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  game_type: string;
  uniqid: string;
  created_at: string;
  updated_at: string;
}

export const mediaApi = {
  async listMedia(): Promise<ApiResponse<{ media: MediaFile[] }>> {
    return apiRequest('/media.php?action=list', {
      method: 'GET',
    });
  },

  async getMedia(uniqid: string, filename: string): Promise<ApiResponse<{ media: MediaFile }>> {
    return apiRequest(`/media.php?action=get&uniqid=${encodeURIComponent(uniqid)}&filename=${encodeURIComponent(filename)}`, {
      method: 'GET',
    });
  },

  async getMediaScenarios(uniqid: string): Promise<ApiResponse<{ scenarios: Scenario[] }>> {
    return apiRequest(`/media.php?action=scenarios&uniqid=${encodeURIComponent(uniqid)}`, {
      method: 'GET',
    });
  },
};
