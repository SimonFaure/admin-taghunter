import { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  User,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  Layers,
  Upload,
} from 'lucide-react';
import {
  adminCardsApi,
  ClientCardSummary,
} from '../lib/api';
import { CardsRegistryEditor, CardsEditorApi } from './CardsRegistryEditor';
import { OnDemandPoolModal } from './OnDemandPoolModal';
import { AssignOnDemandCardsModal } from './AssignOnDemandCardsModal';

export function CardsListView() {
  const [clients, setClients] = useState<ClientCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientCardSummary | null>(null);
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [assignClient, setAssignClient] = useState<ClientCardSummary | null>(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adminCardsApi.listAllDb();
      setClients(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cards list');
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

  if (selectedClient) {
    const api: CardsEditorApi = {
      list: () => adminCardsApi.listCards(selectedClient.id),
      create: async (card) => {
        await adminCardsApi.createCard(selectedClient.id, card);
      },
      update: async (id, fields) => {
        await adminCardsApi.updateCard(selectedClient.id, id, fields);
      },
      remove: async (id) => {
        await adminCardsApi.deleteCard(selectedClient.id, id);
      },
      importCsv: (file) => adminCardsApi.importCsv(selectedClient.id, file),
    };

    return (
      <div>
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedClient(null);
              fetchList();
            }}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to all clients</span>
          </button>
          <div className="h-6 w-px bg-slate-300"></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{selectedClient.name}</h3>
            <p className="text-sm text-slate-600">{selectedClient.email}</p>
          </div>
        </div>
        <CardsRegistryEditor
          api={api}
          title={`Cards · ${selectedClient.name}`}
          description="Register, edit, delete, or bulk-import cards for this client."
        />
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-600">
            All clients and their registered cards
          </p>
          <button
            onClick={() => setShowPoolModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Manage On Demand Pool
          </button>
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
          <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
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
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Cards
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Last updated
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
                      {client.version != null ? (
                        <span className="text-sm text-slate-900">v{client.version.toFixed(2)}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">{client.card_count}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">
                          {formatDate(client.updated_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <span className="text-slate-200">|</span>
                        <button
                          onClick={() => setAssignClient(client)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                          title="On Demand Cards"
                        >
                          <Layers className="w-4 h-4" />
                          <span>On Demand</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPoolModal && <OnDemandPoolModal onClose={() => setShowPoolModal(false)} />}

      {assignClient && (
        <AssignOnDemandCardsModal
          clientId={assignClient.id}
          clientName={assignClient.name}
          onClose={() => setAssignClient(null)}
        />
      )}
    </div>
  );
}
