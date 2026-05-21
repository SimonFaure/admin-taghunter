// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Download, Calendar, Layers, X, Upload, ChevronDown } from 'lucide-react';
import { db } from '../lib/db';
import { Alert } from './Alert';
import { PatternImport } from './PatternImport';
import { generatePatternSlug } from '../utils/patterns';

type PatternStatus = 'draft' | 'published' | 'archived';

interface Pattern {
  id: string;
  name: string;
  game_type: string;
  version: number;
  pattern_slug: string | null;
  status: PatternStatus;
  created_at: string;
  updated_at: string;
  assignment_count: number;
}

interface PatternItem {
  id: string;
  pattern_id: string;
  item_index: number;
  assignment_type: string;
  station_key_number: number;
}

interface PatternsPageProps {
  onEditPattern: (patternId: string, gameType: string, patternName: string) => void;
}

type GameType = 'tagquest' | 'mystery' | 'tracks';
type TabType = 'all' | GameType;

const GAME_TYPE_TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'All Patterns' },
  { key: 'tagquest', label: 'TagQuest' },
  { key: 'mystery', label: 'Mystery' },
  { key: 'tracks', label: 'Tracks' },
];

export function PatternsPage({ onEditPattern }: PatternsPageProps) {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [alert, setAlert] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({
    show: false,
    type: 'success',
    message: '',
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    gameType: 'tagquest' as GameType,
    numberOfItems: 12,
    image_1: true,
    image_2: true,
    image_3: true,
    image_4: true,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; pattern: Pattern | null; isDeleting: boolean }>({
    isOpen: false,
    pattern: null,
    isDeleting: false,
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    try {
      const { data: patternsData, error: patternsError } = await db
        .from('patterns')
        .select('*')
        .order('created_at', { ascending: false });

      if (patternsError) throw patternsError;

      const { data: itemCounts, error: countError } = await db
        .from('pattern_items')
        .select('pattern_id');

      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      (itemCounts || []).forEach((item: { pattern_id: string }) => {
        countMap[item.pattern_id] = (countMap[item.pattern_id] || 0) + 1;
      });

      const enriched = (patternsData || []).map((p: any) => ({
        ...p,
        assignment_count: countMap[p.id] || 0,
      }));

      setPatterns(enriched);
    } catch (error) {
      console.error('Error loading patterns:', error);
      showAlert('error', 'Failed to load patterns');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ show: true, type, message });
  };

  // Sort patterns by game type first, then by name
  const sortedPatterns = [...patterns].sort((a, b) => {
    if (a.game_type !== b.game_type) {
      return a.game_type.localeCompare(b.game_type);
    }
    return a.name.localeCompare(b.name);
  });

  const filteredPatterns = activeTab === 'all'
    ? sortedPatterns
    : sortedPatterns.filter((p) => p.game_type === activeTab);

  const handleOpenCreateModal = () => {
    setCreateForm({
      name: '',
      gameType: activeTab === 'all' ? 'tagquest' : activeTab,
      numberOfItems: 12,
      image_1: true,
      image_2: true,
      image_3: true,
      image_4: true,
      image_5: true,
      image_6: true,
    });
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;

    setIsCreating(true);
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const trimmedName = createForm.name.trim();
      const { data, error } = await db
        .from('patterns')
        .insert({
          name: trimmedName,
          game_type: createForm.gameType,
          pattern_slug: generatePatternSlug(trimmedName),
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw error;

      setPatterns((prev) => [{ ...data, assignment_count: 0 }, ...prev]);
      setActiveTab(createForm.gameType);
      setShowCreateModal(false);
      showAlert('success', `Pattern "${trimmedName}" created successfully`);
    } catch (error) {
      console.error('Error creating pattern:', error);
      showAlert('error', 'Failed to create pattern');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.pattern) return;

    setDeleteDialog((prev) => ({ ...prev, isDeleting: true }));

    try {
      const { error: itemsError } = await db
        .from('pattern_items')
        .delete()
        .eq('pattern_id', deleteDialog.pattern.id);

      if (itemsError) throw itemsError;

      const { error } = await db
        .from('patterns')
        .delete()
        .eq('id', deleteDialog.pattern.id);

      if (error) throw error;

      setPatterns((prev) => prev.filter((p) => p.id !== deleteDialog.pattern!.id));
      showAlert('success', `Pattern "${deleteDialog.pattern.name}" deleted successfully`);
      setDeleteDialog({ isOpen: false, pattern: null, isDeleting: false });
    } catch (error) {
      console.error('Error deleting pattern:', error);
      showAlert('error', 'Failed to delete pattern');
      setDeleteDialog((prev) => ({ ...prev, isDeleting: false }));
    }
  };

  const handleStatusChange = async (pattern: Pattern, newStatus: PatternStatus) => {
    setStatusDropdown(null);
    try {
      const { error } = await db
        .from('patterns')
        .update({ status: newStatus, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
        .eq('id', pattern.id);

      if (error) throw error;

      setPatterns((prev) =>
        prev.map((p) => (p.id === pattern.id ? { ...p, status: newStatus } : p))
      );
      showAlert('success', `Pattern status updated to "${newStatus}"`);
    } catch (error) {
      console.error('Error updating pattern status:', error);
      showAlert('error', 'Failed to update pattern status');
    }
  };


  const handleExportJSON = async (pattern: Pattern) => {
    try {
      const { data: items, error: itemsError } = await db
        .from('pattern_items')
        .select('*')
        .eq('pattern_id', pattern.id)
        .order('item_index', { ascending: true });

      if (itemsError) throw itemsError;

      const exportData = {
        name: pattern.name,
        game_type: pattern.game_type,
        version: String(pattern.version),
        pattern_uniqid: pattern.id,
        pattern_slug: pattern.pattern_slug ?? null,
        description: null,
        is_default: false,
        pattern_data: items || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pattern_${pattern.id}_${pattern.pattern_slug ?? pattern.name.replace(/\s+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showAlert('success', `Exported pattern "${pattern.name}"`);
    } catch (error) {
      console.error('Error exporting pattern JSON:', error);
      showAlert('error', 'Failed to export pattern');
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading patterns...</div>
      </div>
    );
  }

  return (
    <div>
      {alert.show && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert((prev) => ({ ...prev, show: false }))}
        />
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white">Patterns</h2>
          <p className="text-slate-400 mt-1">
            Manage station assignment patterns for your games
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition flex items-center gap-2"
          >
            <Upload size={18} />
            Import
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus size={18} />
            New Pattern
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {GAME_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-2.5 rounded-lg font-medium transition ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredPatterns.length === 0 ? (
        <div className="text-center py-16">
          <Layers className="mx-auto text-slate-600 mb-4" size={48} />
          <p className="text-slate-400 text-lg mb-2">No patterns yet</p>
          <p className="text-slate-500 text-sm">
            Create a new pattern to get started with {GAME_TYPE_TABS.find((t) => t.key === activeTab)?.label}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatterns.map((pattern) => (
            <div
              key={pattern.id}
              className="bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition shadow-lg"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white truncate pr-2">{pattern.name}</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {activeTab === 'all' && (
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs font-medium rounded border border-blue-600/30">
                        {GAME_TYPE_TABS.find((t) => t.key === pattern.game_type)?.label}
                      </span>
                    )}
                    <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs font-medium rounded">
                      v{pattern.version}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                  <span className="flex items-center gap-1.5">
                    <Layers size={14} />
                    {pattern.assignment_count} assignments
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {new Date(pattern.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="relative mb-4">
                  <button
                    onClick={() => setStatusDropdown(statusDropdown === pattern.id ? null : pattern.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition border ${
                      pattern.status === 'published'
                        ? 'bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/30'
                        : pattern.status === 'archived'
                        ? 'bg-slate-600/40 text-slate-400 border-slate-600/50 hover:bg-slate-600/60'
                        : 'bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      pattern.status === 'published'
                        ? 'bg-green-400'
                        : pattern.status === 'archived'
                        ? 'bg-slate-400'
                        : 'bg-amber-400'
                    }`} />
                    {pattern.status.charAt(0).toUpperCase() + pattern.status.slice(1)}
                    <ChevronDown size={12} />
                  </button>
                  {statusDropdown === pattern.id && (
                    <>
                      <div className="fixed inset-0 z-[9]" onClick={() => setStatusDropdown(null)} />
                      <div className="absolute left-0 top-full mt-1 z-10 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden min-w-[130px]">
                      {(['draft', 'published', 'archived'] as PatternStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(pattern, s)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-800 transition text-left ${
                            pattern.status === s ? 'text-white bg-slate-800' : 'text-slate-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            s === 'published' ? 'bg-green-400' : s === 'archived' ? 'bg-slate-400' : 'bg-amber-400'
                          }`} />
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onEditPattern(pattern.id, pattern.game_type, pattern.name)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 text-sm"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleExportJSON(pattern)}
                    className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                    title="Download JSON"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteDialog({ isOpen: true, pattern, isDeleting: false })}
                    className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">New Pattern</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Pattern Name
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter pattern name"
                  className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Game Type
                </label>
                <div className="flex gap-2">
                  {GAME_TYPE_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setCreateForm((prev) => ({ ...prev, gameType: tab.key }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        createForm.gameType === tab.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {createForm.gameType === 'mystery' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Number of enigmas
                  </label>
                  <input
                    type="number"
                    value={createForm.numberOfItems}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        numberOfItems: parseInt(e.target.value) || 1,
                      }))
                    }
                    min={1}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              )}

              {createForm.gameType === 'tracks' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Number of steps
                  </label>
                  <input
                    type="number"
                    value={createForm.numberOfItems}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        numberOfItems: parseInt(e.target.value) || 1,
                      }))
                    }
                    min={1}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              )}

              {createForm.gameType === 'tagquest' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      Number of quests
                    </label>
                    <input
                      type="number"
                      value={createForm.numberOfItems}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          numberOfItems: parseInt(e.target.value) || 1,
                        }))
                      }
                      min={1}
                      className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      Images to use
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['image_1', 'image_2', 'image_3', 'image_4'] as const).map((img) => (
                        <label
                          key={img}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600 transition"
                        >
                          <input
                            type="checkbox"
                            checked={createForm[img]}
                            onChange={(e) =>
                              setCreateForm((prev) => ({
                                ...prev,
                                [img]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-slate-600"
                          />
                          <span className="text-sm text-slate-300">
                            {img.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-900/50 border-t border-slate-700 rounded-b-2xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name.trim() || isCreating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <PatternImport
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            loadPatterns();
          }}
        />
      )}

      {deleteDialog.isOpen && deleteDialog.pattern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="text-red-500" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white mb-2">Delete Pattern</h3>
                  <p className="text-white font-medium mb-2">{deleteDialog.pattern.name}</p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Are you sure you want to delete this pattern? This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-900/50 border-t border-red-500/20 rounded-b-2xl">
              <button
                onClick={() => setDeleteDialog({ isOpen: false, pattern: null, isDeleting: false })}
                disabled={deleteDialog.isDeleting}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteDialog.isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteDialog.isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
