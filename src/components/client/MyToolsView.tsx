import { CreditCard, Smartphone, Search, Filter, Upload, Trash2, Download } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { getClientCards, importCardsFromCSV, deleteAllClientCards, ClientCard } from '../../lib/cardsApi';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  lastConnected: string;
}

export function MyToolsView() {
  const { user } = useSecureAuth();
  const [cards, setCards] = useState<ClientCard[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    if (!user?.id) return;

    try {
      setCardsLoading(true);
      const data = await getClientCards(user.id);
      setCards(data);
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setCardsLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    try {
      setUploading(true);
      console.log('Reading file...');
      const text = await file.text();
      console.log('File content length:', text.length);
      console.log('First 200 characters:', text.substring(0, 200));

      console.log('Importing cards...');
      await importCardsFromCSV(user.id, text);

      console.log('Reloading cards...');
      await loadCards();

      alert('Cards imported successfully!');
    } catch (error) {
      console.error('Failed to import cards:', error);
      alert(`Failed to import cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!user?.id) return;
    if (!confirm('Are you sure you want to delete all cards? This action cannot be undone.')) return;

    try {
      setCardsLoading(true);
      await deleteAllClientCards(user.id);
      setCards([]);
      alert('All cards deleted successfully');
    } catch (error) {
      console.error('Failed to delete cards:', error);
      alert('Failed to delete cards');
    } finally {
      setCardsLoading(false);
    }
  };

  const filteredCards = cards.filter(card =>
    card.card_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.card_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.card_rarity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <CreditCard className="w-6 h-6" />
              <span>My Cards</span>
            </h2>
            <p className="text-slate-600 mt-1">
              Import and manage your game cards collection
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {cards.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={cardsLoading}
                className="flex items-center space-x-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={`mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {uploading ? 'Importing Cards...' : 'Import Cards from CSV'}
          </h3>
          <p className="text-slate-600 mb-2">
            {uploading ? 'Please wait while we process your file...' : 'Drag and drop your CSV file here, or click to browse'}
          </p>
          {!uploading && (
            <div className="text-sm text-slate-500 space-y-1">
              <p className="font-medium">Expected CSV columns (any order):</p>
              <p>Name, Type, Rarity, Power, Description</p>
              <p className="text-xs mt-2">Note: This will replace all existing cards</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {cards.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Total Cards: <span className="font-semibold">{cards.length}</span>
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {!cardsLoading && cards.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cards Found</h3>
            <p className="text-slate-600">
              Upload a CSV file to import your cards collection
            </p>
          </div>
        ) : cards.length > 0 ? (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Rarity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Power
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredCards.map((card) => (
                  <tr key={card.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {card.card_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {card.card_type || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {card.card_rarity || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {card.card_power || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-md truncate">
                      {card.card_description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Smartphone className="w-6 h-6" />
              <span>My Devices</span>
            </h2>
            <p className="text-slate-600 mt-1">
              Manage your connected game devices
            </p>
          </div>
          <button className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
            Add Device
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Smartphone className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Devices Found</h3>
            <p className="text-slate-600 mb-4">
              Connect your devices to start playing and tracking your game progress.
            </p>
            <button className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
              Connect Your First Device
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device) => (
              <div key={device.id} className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{device.name}</h3>
                      <p className="text-sm text-slate-600">{device.type}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    device.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {device.status}
                  </span>
                </div>
                <div className="text-sm text-slate-600">
                  Last connected: {device.lastConnected}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
