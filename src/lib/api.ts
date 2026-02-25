const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

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

  async deleteMedia(uniqid: string, filename: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return apiRequest('/media.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ uniqid, filename }),
    });
  },
};

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminData {
  email: string;
  password: string;
  name?: string;
}

export interface UpdateAdminData {
  id: string;
  email?: string;
  password?: string;
  name?: string;
}

export const adminUsersApi = {
  async getAdminUsers(): Promise<ApiResponse<{ admins: AdminUser[] }>> {
    return apiRequest('/admin_users.php?action=list', {
      method: 'GET',
    });
  },

  async createAdminUser(data: CreateAdminData): Promise<ApiResponse<{ admin: AdminUser }>> {
    return apiRequest('/admin_users.php?action=create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminUser(data: UpdateAdminData): Promise<ApiResponse<{ admin: AdminUser }>> {
    return apiRequest('/admin_users.php?action=update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminUser(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return apiRequest('/admin_users.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

export interface ScenarioData {
  id: string;
  client_id?: number;
  title: string;
  description: string;
  media_url?: string;
  game_data?: string;
  game_type?: string;
  scenario_type?: string;
  status?: string;
  uniqid: string;
  created_at: string;
  updated_at?: string;
  creator_name?: string;
  client_name?: string;
  client_email?: string;
}

export const scenariosApi = {
  async listScenarios(clientId?: string): Promise<ApiResponse<{ scenarios: ScenarioData[] }>> {
    const url = clientId
      ? `/scenarios.php?action=list&client_id=${encodeURIComponent(clientId)}`
      : '/scenarios.php?action=list';
    return apiRequest(url, {
      method: 'GET',
    });
  },

  async getScenario(id: string): Promise<ApiResponse<{ scenario: ScenarioData }>> {
    return apiRequest(`/scenarios.php?action=get&id=${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  async deleteScenario(id: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return apiRequest('/scenarios.php?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

export interface DashboardStats {
  clients: number;
  scenarios: number;
  storage: {
    bytes: number;
    formatted: string;
  };
  api_requests: {
    total: number;
    percent_change: number;
  };
}

export interface DashboardActivity {
  type: string;
  icon: string;
  title: string;
  detail: string;
  time: string;
}

export const dashboardApi = {
  async getStats(): Promise<ApiResponse<DashboardStats>> {
    return apiRequest('/dashboard.php?action=stats', {
      method: 'GET',
    });
  },

  async getRecentActivity(limit: number = 10): Promise<ApiResponse<{ activities: DashboardActivity[] }>> {
    return apiRequest(`/dashboard.php?action=recent-activity&limit=${limit}`, {
      method: 'GET',
    });
  },
};

export interface ClientCardMetadata {
  id: number;
  email: string;
  name: string;
  version: number | null;
  created_at: string | null;
  updated_at: string | null;
  has_file: boolean;
  file_size: number;
  card_count: number;
}

export interface CardData {
  [key: string]: string;
}

export interface ClientCardsDataResponse {
  success: boolean;
  data: CardData[];
  headers: string[];
  count: number;
}

export const adminCardsApi = {
  async listAll(): Promise<ApiResponse<{ data: ClientCardMetadata[] }>> {
    return apiRequest('/cards.php?action=admin_list_all', {
      method: 'GET',
    });
  },

  async getCardsData(clientId: number): Promise<ApiResponse<ClientCardsDataResponse>> {
    return apiRequest(`/cards.php?action=admin_get_data&client_id=${clientId}`, {
      method: 'GET',
    });
  },
};
