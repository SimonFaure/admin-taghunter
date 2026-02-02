import { CreditCard, Search, Filter } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Card {
  id: string;
  name: string;
  type: string;
  status: string;
  lastUsed: string;
}

export function MyCardsView() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-slate-600">
          Manage your game cards and collectibles
        </p>
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
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cards Yet</h3>
          <p className="text-slate-600">
            Start playing games to collect cards and build your collection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => (
            <div key={card.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer">
              <div className="aspect-[3/4] bg-slate-100 rounded-lg mb-3 flex items-center justify-center">
                <CreditCard className="w-12 h-12 text-slate-400" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{card.name}</h3>
              <p className="text-sm text-slate-600">{card.type}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
