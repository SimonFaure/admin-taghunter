export type LicenseType = 'access' | 'premium';

export interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  avatar_url?: string;
  license_type?: LicenseType;
  billing_up_to_date?: boolean;
  playground_version?: string;
  creator_version?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

export interface CreateClientData {
  email: string;
  password?: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  avatar_url?: string;
  license_type?: LicenseType;
  billing_up_to_date?: boolean;
  playground_version?: string;
  creator_version?: string;
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: string;
}
