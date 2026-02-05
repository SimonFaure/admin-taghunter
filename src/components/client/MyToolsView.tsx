import { CreditCard, Smartphone, Search, Filter } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Card {
  id: string;
  name: string;
  type: string;
  status: string;
  lastUsed: string;
}

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  lastConnected: string;
}

export function MyToolsView() {
  const [cards, setCards] = useState<Card[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(false);
  }, []);

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
              Manage your game cards and collectibles
            </p>
          </div>
          <div className="flex items-center space-x-3">
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
            <button className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all">
              <Filter className="w-4 h-4" />
              <span>Filter</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cards Yet</h3>
            <p className="text-slate-600">
              Start playing games to collect cards and build your collection.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card) => (
              <div key={card.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:shadow-md transition-all cursor-pointer">
                <div className="aspect-[3/4] bg-white rounded-lg mb-3 flex items-center justify-center">
                  <CreditCard className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{card.name}</h3>
                <p className="text-sm text-slate-600">{card.type}</p>
              </div>
            ))}
          </div>
        )}
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Smartphone className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Devices Connected</h3>
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
