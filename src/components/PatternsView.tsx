import { useState, useEffect } from 'react';
import { Package, Search, Filter, Download, Eye, Trash2, Plus, CreditCard as Edit } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { broadcastAdminNotification } from '../lib/adminNotificationsApi';

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

export function PatternsView() {
  const { user } = useAuth();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [filteredPatterns, setFilteredPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGameType, setSelectedGameType] = useState<string>('all');
  const [gameTypes, setGameTypes] = useState<string[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    game_type: '',
    pattern_data: '',
    is_default: false,
  });

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
        'https://admin.taghunter.fr/backend/api/patterns.php?action=list',
        {
          credentials: 'include',
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
          pattern.game_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pattern.created_by_email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedGameType !== 'all') {
      filtered = filtered.filter((pattern) => pattern.game_type === selectedGameType);
    }

    setFilteredPatterns(filtered);
  };

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

  const handleEdit = (pattern: Pattern) => {
    setEditingPattern(pattern);
    setFormData({
      name: pattern.name,
      description: pattern.description || '',
      game_type: pattern.game_type,
      pattern_data: JSON.stringify(JSON.parse(pattern.pattern_data), null, 2),
      is_default: pattern.is_default,
    });
    setShowEditModal(true);
  };

  const handleDelete = async (patternId: number) => {
    if (!confirm('Are you sure you want to delete this pattern?')) {
      return;
    }

    try {
      const response = await fetch(
        `https://admin.taghunter.fr/backend/api/patterns.php?action=delete&id=${patternId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete pattern');
      }

      setPatterns(patterns.filter((p) => p.id !== patternId));
      setSuccess('Pattern deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pattern');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      let patternJson;
      try {
        patternJson = JSON.parse(formData.pattern_data);
      } catch {
        throw new Error('Invalid JSON format in pattern data');
      }

      const response = await fetch(
        'https://admin.taghunter.fr/backend/api/patterns.php?action=create',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            game_type: formData.game_type,
            pattern_data: patternJson,
            is_default: formData.is_default,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create pattern');
      }

      setPatterns([result.data, ...patterns]);
      setShowCreateModal(false);
      setFormData({
        name: '',
        description: '',
        game_type: '',
        pattern_data: '',
        is_default: false,
      });
      setSuccess('Pattern created successfully');
      setTimeout(() => setSuccess(''), 3000);

      broadcastAdminNotification(
        'pattern_created',
        'New pattern created',
        `"${formData.name}" was created by ${user?.email ?? 'an admin'}`,
        {
          creator_email: user?.email,
          item_id: result.data?.id,
          item_name: formData.name,
          navigate_to: 'patterns',
        },
        (user as any)?.id
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pattern');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!editingPattern) return;

    try {
      let patternJson;
      try {
        patternJson = JSON.parse(formData.pattern_data);
      } catch {
        throw new Error('Invalid JSON format in pattern data');
      }

      const response = await fetch(
        `https://admin.taghunter.fr/backend/api/patterns.php?action=update&id=${editingPattern.id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingPattern.id,
            name: formData.name,
            description: formData.description,
            game_type: formData.game_type,
            pattern_data: patternJson,
            is_default: formData.is_default,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update pattern');
      }

      setPatterns(patterns.map((p) => (p.id === editingPattern.id ? result.data : p)));
      setShowEditModal(false);
      setEditingPattern(null);
      setFormData({
        name: '',
        description: '',
        game_type: '',
        pattern_data: '',
        is_default: false,
      });
      setSuccess('Pattern updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pattern');
    }
  };

  const groupedPatterns = () => {
    const grouped: Record<string, Pattern[]> = {};

    filteredPatterns.forEach((pattern) => {
      if (!grouped[pattern.game_type]) {
        grouped[pattern.game_type] = [];
      }
      grouped[pattern.game_type].push(pattern);
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  const grouped = groupedPatterns();

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Patterns Management</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Pattern</span>
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search patterns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
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

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">No patterns found</p>
            <p className="text-sm text-slate-500">
              {searchTerm || selectedGameType !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first pattern to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(grouped)
              .sort()
              .map((gameType) => (
                <div key={gameType}>
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    {gameType}
                    <span className="text-sm font-normal text-slate-500">
                      ({grouped[gameType].length})
                    </span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grouped[gameType].map((pattern) => (
                      <div
                        key={pattern.id}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900 mb-1">{pattern.name}</h4>
                            <div className="flex items-center gap-2 mb-2">
                              {pattern.is_default && (
                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                  Default
                                </span>
                              )}
                              <span className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded">
                                {pattern.owner_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        {pattern.description && (
                          <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                            {pattern.description}
                          </p>
                        )}

                        <div className="text-xs text-slate-500 mb-4">
                          <p>Created by: {pattern.created_by_email}</p>
                          <p>
                            Created:{' '}
                            {new Date(pattern.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePreview(pattern)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Preview</span>
                          </button>
                          <button
                            onClick={() => handleDownload(pattern)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(pattern)}
                            className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(pattern.id)}
                            className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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

      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">
                {showCreateModal ? 'Create Pattern' : 'Edit Pattern'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingPattern(null);
                  setFormData({
                    name: '',
                    description: '',
                    game_type: '',
                    pattern_data: '',
                    is_default: false,
                  });
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span className="text-2xl text-slate-400">&times;</span>
              </button>
            </div>

            <form
              onSubmit={showCreateModal ? handleCreate : handleUpdate}
              className="flex-1 overflow-auto p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Pattern Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Game Type *
                </label>
                <input
                  type="text"
                  value={formData.game_type}
                  onChange={(e) => setFormData({ ...formData, game_type: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g., TagHunter, Escape Game"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Pattern Data (JSON) *
                </label>
                <textarea
                  value={formData.pattern_data}
                  onChange={(e) => setFormData({ ...formData, pattern_data: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-sm"
                  rows={10}
                  placeholder='{"key": "value"}'
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900"
                />
                <label htmlFor="is_default" className="text-sm font-medium text-slate-700">
                  Make this a default pattern (available to all users)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setEditingPattern(null);
                    setFormData({
                      name: '',
                      description: '',
                      game_type: '',
                      pattern_data: '',
                      is_default: false,
                    });
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  {showCreateModal ? 'Create' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
