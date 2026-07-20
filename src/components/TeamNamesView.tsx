import { useEffect, useMemo, useState } from 'react';
import { User, ChevronRight, Search, X, Tags } from 'lucide-react';
import { adminCardsApi, ClientCardSummary } from '../lib/api';
import type { TeamNamePoolScope } from '../lib/api';
import { TeamNamePoolModal } from './TeamNamePoolModal';
import { HelpButton } from '../help';

export function TeamNamesView() {
  const [clients, setClients] = useState<ClientCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Team-name pool modal. scope = 'global' (catalog) or a numeric client_id.
  const [namePoolScope, setNamePoolScope] = useState<TeamNamePoolScope | null>(null);
  const [namePoolClientName, setNamePoolClientName] = useState<string | undefined>(undefined);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adminCardsApi.listAllDb();
      setClients(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clients list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-600">
            Curated team-name pools - the global catalog and per-client overrides
          </p>
          <div className="flex items-center gap-2">
            <HelpButton chapter="cards" label="Help" className="mr-1 text-slate-500 hover:text-slate-800" />
            <button
              onClick={() => { setNamePoolClientName(undefined); setNamePoolScope('global'); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              <Tags className="w-4 h-4" />
              Team Name Catalog
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <Tags className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? 'No results' : 'No clients yet'}
          </h3>
          <p className="text-slate-600">
            {searchQuery ? 'Try adjusting your search.' : 'Clients will appear here once they have an account.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filtered.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{client.name}</p>
                          <p className="text-xs text-slate-500">{client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => { setNamePoolClientName(client.name); setNamePoolScope(client.id); }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        title="Team Name Pool"
                      >
                        <Tags className="w-4 h-4" />
                        <span>Manage team names</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {namePoolScope !== null && (
        <TeamNamePoolModal
          scope={namePoolScope}
          clientName={namePoolClientName}
          onClose={() => setNamePoolScope(null)}
        />
      )}
    </div>
  );
}
