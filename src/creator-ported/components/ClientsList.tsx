// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { Users, Mail, Phone, Building2, Package, RefreshCw, CheckCircle, XCircle, Download, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  license_type: string;
  creator_version: string;
  playground_version: string;
  billing_up_to_date: boolean;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export function ClientsList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingClients, setFetchingClients] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!authService.isAdmin()) {
        setError('Access denied. Admin privileges required.');
        setLoading(false);
        return;
      }

      const email = authService.getEmail();
      if (!email) {
        setError('User email not found');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/clients.php?action=creator_list&email=${encodeURIComponent(email)}`
      );

      if (!response.ok) {
        let errorMessage = 'Failed to fetch clients';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch clients');
      }

      setClients(data.data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  };

  const handleFetchFromServer = async () => {
    const email = authService.getEmail();
    if (!email) {
      setFetchMessage({ type: 'error', message: 'User email not found' });
      return;
    }

    setFetchingClients(true);
    setFetchMessage(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/clients.php?action=creator_list&email=${encodeURIComponent(email)}`
      );
      const result = await response.json();

      if (result.success) {
        const count = Array.isArray(result.data) ? result.data.length : 0;
        setClients(result.data || []);
        setFetchMessage({
          type: 'success',
          message: `Successfully fetched ${count} clients from admin backend`
        });
      } else {
        setFetchMessage({
          type: 'error',
          message: result.error || 'Failed to fetch clients'
        });
      }
    } catch (err) {
      setFetchMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to fetch clients'
      });
    } finally {
      setFetchingClients(false);
      setTimeout(() => setFetchMessage(null), 5000);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-slate-300">Loading clients...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white">Clients</h1>
            <p className="text-slate-400">{clients.length} total clients</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleFetchFromServer}
            disabled={fetchingClients}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            title="Fetch clients from studio.taghunter.fr"
          >
            {fetchingClients ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Fetch Clients
              </>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            title="Refresh from database"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {fetchMessage && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${
          fetchMessage.type === 'success'
            ? 'bg-green-900/30 border-green-700 text-green-400'
            : 'bg-red-900/30 border-red-700 text-red-400'
        }`}>
          {fetchMessage.message}
        </div>
      )}

      {clients.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
          <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No clients found</h3>
          <p className="text-slate-400">Clients will appear here once they are synced from the API.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {client.avatar_url ? (
                    <img
                      src={client.avatar_url}
                      alt={client.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-white">{client.name}</h3>
                    <span className="text-xs text-slate-500">ID: {client.id}</span>
                  </div>
                </div>
                {client.billing_up_to_date ? (
                  <CheckCircle className="w-5 h-5 text-green-500" title="Billing up to date" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" title="Billing not up to date" />
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span className="truncate">{client.email}</span>
                </div>

                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Phone className="w-4 h-4 text-slate-500" />
                    <span>{client.phone}</span>
                  </div>
                )}

                {client.company && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span>{client.company}</span>
                  </div>
                )}
              </div>

              {client.license_type && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">License:</span>
                    <span className="px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded text-xs font-medium">
                      {client.license_type}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-700 space-y-1">
                {client.creator_version && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Creator Version:</span>
                    <span className="text-slate-300">{client.creator_version}</span>
                  </div>
                )}
                {client.playground_version && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Playground Version:</span>
                    <span className="text-slate-300">{client.playground_version}</span>
                  </div>
                )}
              </div>

              {client.notes && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <p className="text-xs text-slate-400 italic">{client.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
