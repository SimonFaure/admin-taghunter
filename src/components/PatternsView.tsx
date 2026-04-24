import { useState, useEffect } from 'react';
import { Package, Search, Filter, Download, Eye, Trash2, Pencil, Plus, ChevronLeft, ChevronDown, Calendar, User, Tag, X } from 'lucide-react';

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
  status?: string | null;
}

const STATUS_OPTIONS = ['draft', 'published', 'archived'];

function statusStyle(status: string | null | undefined) {
  const s = status || 'draft';
  if (s === 'published') return 'bg-green-100 text-green-700 border-green-200';
  if (s === 'archived') return 'bg-slate-200 text-slate-600 border-slate-300';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

function statusFocus(status: string | null | undefined) {
  const s = status || 'draft';
  if (s === 'published') return 'focus:ring-green-400';
  if (s === 'archived') return 'focus:ring-slate-400';
  return 'focus:ring-amber-400';
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PatternsView() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [filteredPatterns, setFilteredPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGameType, setSelectedGameType] = useState<string>('all');
  const [gameTypes, setGameTypes] = useState<string[]>([]);

  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);

  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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
        `${API_BASE_URL}/patterns.php?action=list`,
        { credentials: 'include' }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to fetch patterns');
      }
      const patternsData: Pattern[] = result.data || [];
      setPatterns(patternsData);
      const types = Array.from(new Set(patternsData.map((p) => p.game_type))) as string[];
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
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.game_type.toLowerCase().includes(q) ||
          p.created_by_email?.toLowerCase().includes(q)
      );
    }
    if (selectedGameType !== 'all') {
      filtered = filtered.filter((p) => p.game_type === selectedGameType);
    }
    setFilteredPatterns(filtered);
  };

  const handleStatusChange = async (pattern: Pattern, newStatus: string) => {
    if (newStatus === (pattern.status || 'draft')) return;
    setStatusUpdating(pattern.id);
    setStatusError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=update_status`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pattern.id, status: newStatus }),
        }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update status');
      }
      const updated = result.data ?? { ...pattern, status: newStatus };
      setPatterns((prev) => prev.map((p) => (p.id === pattern.id ? updated : p)));
      if (selectedPattern?.id === pattern.id) setSelectedPattern(updated);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleDownload = (pattern: Pattern) => {
    const dataStr = JSON.stringify(JSON.parse(pattern.pattern_data), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${pattern.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (patternId: number) => {
    if (!confirm('Are you sure you want to delete this pattern?')) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=delete&id=${patternId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete pattern');
      }
      setPatterns((prev) => prev.filter((p) => p.id !== patternId));
      if (selectedPattern?.id === patternId) setSelectedPattern(null);
      setSuccess('Pattern deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pattern');
    }
  };

  const openEdit = (pattern: Pattern) => {
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

  const resetForm = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditingPattern(null);
    setFormData({ name: '', description: '', game_type: '', pattern_data: '', is_default: false });
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const patternJson = JSON.parse(formData.pattern_data);
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=create`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
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
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to create pattern');
      setPatterns((prev) => [result.data, ...prev]);
      resetForm();
      setSuccess('Pattern created successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pattern');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!editingPattern) return;
    try {
      const patternJson = JSON.parse(formData.pattern_data);
      const response = await fetch(
        `${API_BASE_URL}/patterns.php?action=update&id=${editingPattern.id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
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
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to update pattern');
      const updated = result.data;
      setPatterns((prev) => prev.map((p) => (p.id === editingPattern.id ? updated : p)));
      if (selectedPattern?.id === editingPattern.id) setSelectedPattern(updated);
      resetForm();
      setSuccess('Pattern updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pattern');
    }
  };

  if (selectedPattern) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSelectedPattern(null)}
              className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="font-medium">Back to Patterns</span>
            </button>
            <div className="h-6 w-px bg-slate-300" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedPattern.name}</h3>
              <p className="text-sm text-slate-500">{selectedPattern.game_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload(selectedPattern)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={() => openEdit(selectedPattern)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
            >
              <Pencil className="w-4 h-4" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => handleDelete(selectedPattern.id)}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {(error || success) && (
          <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            {error || success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Details</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500">Game Type:</span>
                  <span className="font-medium text-slate-900">{selectedPattern.game_type}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500">Owner:</span>
                  <span className="font-medium text-slate-900 capitalize">{selectedPattern.owner_type}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500">Created:</span>
                  <span className="font-medium text-slate-900">{formatDate(selectedPattern.created_at)}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="text-slate-500 shrink-0">By:</span>
                  <span className="font-medium text-slate-900 break-all">{selectedPattern.created_by_email}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  {selectedPattern.is_default && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">Default</span>
                  )}
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded capitalize">{selectedPattern.owner_type}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-sm font-medium text-slate-700 mb-2">Status</p>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={selectedPattern.status || 'draft'}
                      onChange={(e) => handleStatusChange(selectedPattern, e.target.value)}
                      disabled={statusUpdating === selectedPattern.id}
                      className={`appearance-none pl-2 pr-6 py-1 rounded text-xs font-semibold capitalize border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${statusStyle(selectedPattern.status)} ${statusFocus(selectedPattern.status)}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                  </div>
                  {statusUpdating === selectedPattern.id && (
                    <span className="text-xs text-slate-400 animate-pulse">Saving...</span>
                  )}
                </div>
                {statusError && <p className="text-xs text-red-500 mt-1">{statusError}</p>}
              </div>
            </div>

            {selectedPattern.description && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{selectedPattern.description}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700">Pattern Data (JSON)</h4>
              </div>
              <div className="p-5 overflow-auto max-h-[60vh]">
                <pre className="bg-slate-50 p-4 rounded-lg text-xs border border-slate-200 overflow-auto leading-relaxed">
                  {JSON.stringify(JSON.parse(selectedPattern.pattern_data), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {(showCreateModal || showEditModal) && renderFormModal()}
      </div>
    );
  }

  function renderFormModal() {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h3 className="text-xl font-bold text-slate-900">
              {showCreateModal ? 'Create Pattern' : 'Edit Pattern'}
            </h3>
            <button onClick={resetForm} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {error && (
            <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form
            onSubmit={showCreateModal ? handleCreate : handleUpdate}
            className="flex-1 overflow-auto p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pattern Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Game Type *</label>
              <input
                type="text"
                value={formData.game_type}
                onChange={(e) => setFormData({ ...formData, game_type: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                placeholder="e.g., TagHunter, Escape Game"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pattern Data (JSON) *</label>
              <textarea
                value={formData.pattern_data}
                onChange={(e) => setFormData({ ...formData, pattern_data: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-xs"
                rows={12}
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
                onClick={resetForm}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
              >
                {showCreateModal ? 'Create' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="mb-6">
        <p className="text-slate-600 mb-4">Manage and review all game patterns</p>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search patterns by name, type or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedGameType}
              onChange={(e) => setSelectedGameType(e.target.value)}
              className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 appearance-none bg-white text-sm"
            >
              <option value="all">All Game Types</option>
              {gameTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create Pattern</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : filteredPatterns.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {searchTerm || selectedGameType !== 'all' ? 'No Results Found' : 'No Patterns Found'}
          </h3>
          <p className="text-slate-600">
            {searchTerm || selectedGameType !== 'all'
              ? 'Try adjusting your search or filter'
              : 'Create your first pattern to get started'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pattern</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Game Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Updated</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredPatterns.map((pattern) => (
                  <tr key={pattern.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{pattern.name}</p>
                          {pattern.is_default && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Default</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-900">{pattern.game_type}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-900 capitalize">{pattern.owner_type}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-600">{pattern.created_by_email || '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-900">{formatDate(pattern.updated_at)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <select
                            value={pattern.status || 'draft'}
                            onChange={(e) => handleStatusChange(pattern, e.target.value)}
                            disabled={statusUpdating === pattern.id}
                            className={`appearance-none pl-2 pr-6 py-1 rounded text-xs font-semibold capitalize border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${statusStyle(pattern.status)} ${statusFocus(pattern.status)}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                        </div>
                        {statusUpdating === pattern.id && (
                          <span className="text-xs text-slate-400 animate-pulse">Saving...</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedPattern(pattern)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View</span>
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => handleDownload(pattern)}
                          className="text-slate-500 hover:text-slate-700 transition-colors"
                          title="Download JSON"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(pattern)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(pattern.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {statusError && (
        <div className="mt-3 text-sm text-red-600">{statusError}</div>
      )}

      {(showCreateModal || showEditModal) && renderFormModal()}
    </div>
  );
}
