import { useState, useEffect } from 'react';
import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Package, Search, Filter, Download, Eye, Trash2, Plus } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface Pattern {
  id: number;
  name: string;
  description: string;
  game_type: string;
  pattern_data: string;
  is_default: boolean;
  owner_type: string;
  owner_id: number | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

interface PatternCardProps {
  pattern: Pattern;
  onPreview: (p: Pattern) => void;
  onDownload: (p: Pattern) => void;
  onDelete: ((id: number) => void) | undefined;
}

function PatternCard({ pattern, onPreview, onDownload, onDelete }: PatternCardProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="font-semibold text-slate-900 mb-1">{pattern.name}</h4>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
              {pattern.game_type}
            </span>
          </div>
        </div>
      </div>

      {pattern.description && (
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">{pattern.description}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPreview(pattern)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
        >
          <Eye className="w-4 h-4" />
          <span>Preview</span>
        </button>
        <button
          onClick={() => onDownload(pattern)}
          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>
        {onDelete && (
          <button
            onClick={() => onDelete(pattern.id)}
            className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function MyPatternsView() {
  const { user } = useSecureAuth();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [filteredPatterns, setFilteredPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGameType, setSelectedGameType] = useState<string>('all');
  const [gameTypes, setGameTypes] = useState<string[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchPatterns();
  }, []);

  useEffect(() => {
    filterPatterns();
  }, [patterns, searchTerm, selectedGameType]);

  const fetchPatterns = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=list`,
        {
          headers: {
            'X-Auth-Token': user?.token || '',
          },
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to fetch patterns');
      }

      const patternsData = result.data || [];
      setPatterns(patternsData);

      const types = Array.from(new Set(patternsData.map((p: Pattern) => p.game_type)));
      setGameTypes(types.sort());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patterns');
    } finally {
      setLoading(false);
    }
  };

  const filterPatterns = () => {
    let filtered = patterns;

    if (searchTerm) {
      filtered = filtered.filter(
        (pattern) =>
          pattern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pattern.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pattern.game_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedGameType !== 'all') {
      filtered = filtered.filter((pattern) => pattern.game_type === selectedGameType);
    }

    setFilteredPatterns(filtered);
  };

  const defaultPatterns = filteredPatterns.filter((p) => p.is_default);
  const customPatterns = filteredPatterns.filter((p) => !p.is_default);

  const handleDownload = (pattern: Pattern) => {
    const dataStr = JSON.stringify(JSON.parse(pattern.pattern_data), null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${pattern.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePreview = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setShowPreview(true);
  };

  const handleDelete = async (patternId: number) => {
    if (!confirm('Are you sure you want to delete this pattern?')) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=delete&id=${patternId}`,
        {
          method: 'DELETE',
          headers: {
            'X-Auth-Token': user?.token || '',
          },
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete pattern');
      }

      setPatterns(patterns.filter((p) => p.id !== patternId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pattern');
    }
  };

  const getPatternCount = (type: 'default' | 'custom') => {
    return patterns.filter((p) => (type === 'default' ? p.is_default : !p.is_default)).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">Default Patterns</p>
              <p className="text-2xl font-bold text-blue-900">{getPatternCount('default')}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Plus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">My Custom Patterns</p>
              <p className="text-2xl font-bold text-green-900">{getPatternCount('custom')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search patterns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={selectedGameType}
            onChange={(e) => setSelectedGameType(e.target.value)}
            className="pl-10 pr-8 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 appearance-none bg-white"
          >
            <option value="all">All Game Types</option>
            {gameTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-5">Default Patterns</h3>
        {defaultPatterns.length === 0 ? (
          <div className="text-center py-10">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {searchTerm || selectedGameType !== 'all' ? 'No default patterns match your filters' : 'No default patterns available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defaultPatterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onDelete={undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-5">My Custom Patterns</h3>
        {customPatterns.length === 0 ? (
          <div className="text-center py-10">
            <Plus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {searchTerm || selectedGameType !== 'all' ? 'No custom patterns match your filters' : 'No custom patterns yet — upload one from Creator'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customPatterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onDelete={pattern.owner_id === user?.client_id ? handleDelete : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {showPreview && selectedPattern && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedPattern.name}</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedPattern.game_type}</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span className="text-2xl text-slate-400">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <pre className="bg-slate-50 p-4 rounded-lg text-xs overflow-auto border border-slate-200">
                {JSON.stringify(JSON.parse(selectedPattern.pattern_data), null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => handleDownload(selectedPattern)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
