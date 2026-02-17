import { useState, useEffect } from 'react';
import { CreditCard, User, FileText, Calendar, HardDrive, ChevronRight, ChevronLeft, Search, X } from 'lucide-react';
import { adminCardsApi, ClientCardMetadata, CardData } from '../lib/api';

export function CardsListView() {
  const [cardsList, setCardsList] = useState<ClientCardMetadata[]>([]);
  const [filteredList, setFilteredList] = useState<ClientCardMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientCardMetadata | null>(null);
  const [cardsData, setCardsData] = useState<CardData[]>([]);
  const [cardsHeaders, setCardsHeaders] = useState<string[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  useEffect(() => {
    fetchCardsList();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredList(cardsList);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredList(
        cardsList.filter(
          (client) =>
            client.name.toLowerCase().includes(query) ||
            client.email.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, cardsList]);

  const fetchCardsList = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await adminCardsApi.listAll();

      if (response.data) {
        setCardsList(response.data.data);
        setFilteredList(response.data.data);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError('Failed to fetch cards list');
      console.error('Failed to fetch cards list:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCardsData = async (client: ClientCardMetadata) => {
    if (!client.has_file) {
      setError('This client has no cards file');
      return;
    }

    setLoadingCards(true);
    setError(null);

    try {
      const response = await adminCardsApi.getCardsData(client.id);

      if (response.data) {
        setCardsData(response.data.data);
        setCardsHeaders(response.data.headers);
        setSelectedClient(client);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError('Failed to fetch cards data');
      console.error('Failed to fetch cards data:', err);
    } finally {
      setLoadingCards(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const closeCardsView = () => {
    setSelectedClient(null);
    setCardsData([]);
    setCardsHeaders([]);
    setError(null);
  };

  if (selectedClient) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={closeCardsView}
              className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="font-medium">Back to List</span>
            </button>
            <div className="h-6 w-px bg-slate-300"></div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedClient.name}</h3>
              <p className="text-sm text-slate-600">{selectedClient.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-sm text-slate-600">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Version {selectedClient.version}</span>
            </div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4" />
              <span>{selectedClient.card_count} cards</span>
            </div>
          </div>
        </div>

        {loadingCards ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {cardsHeaders.map((header) => (
                      <th
                        key={header}
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {cardsData.map((card, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      {cardsHeaders.map((header) => (
                        <td key={header} className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-900">{card[header] || '-'}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600 mb-4">
          View all client card lists and their details
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
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
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
      ) : filteredList.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchQuery ? 'No Results Found' : 'No Cards Found'}
          </h3>
          <p className="text-slate-600">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'No clients have uploaded cards yet'}
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
                    Cards Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    File Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredList.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
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
                      {client.version ? (
                        <span className="text-sm text-slate-900">v{client.version}</span>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <CreditCard className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">
                          {client.has_file ? client.card_count : 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <HardDrive className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">
                          {client.has_file ? formatFileSize(client.file_size) : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">
                          {formatDate(client.updated_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.has_file ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          No File
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => fetchCardsData(client)}
                        disabled={!client.has_file}
                        className="inline-flex items-center space-x-1 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        <span>View Cards</span>
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
    </div>
  );
}
