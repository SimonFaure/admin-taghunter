export interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

export interface CreateClientData {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
}

export interface UpdateClientData extends Partial<CreateClientData> {
  id: string;
}
