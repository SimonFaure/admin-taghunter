import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Package, Search, Filter, Download, Eye, Trash2, Plus, Pencil, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { HelpButton } from '../../help';
import { GameTypeIcon } from '../icons/GameTypeIcons';
import { PatternBuilderModal } from './PatternBuilderModal';
import { parsePatternData, patternColumns } from './patternShapes';
import { downloadPatternCsv, downloadPatternXlsx } from './patternExport';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface Pattern {
  id: number;
  name: string;
  description: string;
  game_type: string;
  version: string;
  status: string;
  pattern_uniqid?: string;
  pattern_slug?: string;
  pattern_data: string;
  is_default: boolean;
  owner_type: string;
  owner_id: number | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

interface PatternTableProps {
  patterns: Pattern[];
  onPreview: (p: Pattern) => void;
  getOnEdit: (p: Pattern) => (() => void) | undefined;
  getOnSetStatus: (p: Pattern) => ((status: string) => void) | undefined;
  getOnDelete: (p: Pattern) => (() => void) | undefined;
  showStatus?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'draft', dot: 'bg-amber-400' },
  { value: 'published', dot: 'bg-green-500' },
  { value: 'archived', dot: 'bg-slate-400' },
];

function statusBadgeClass(status: string) {
  return status === 'published'
    ? 'bg-green-100 text-green-700'
    : status === 'archived'
      ? 'bg-slate-200 text-slate-600'
      : 'bg-amber-100 text-amber-700';
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('patternsList');
  const s = status || 'draft';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(s)}`}>{t(`status.${s}`, s)}</span>
  );
}

// Interactive status setter (draft / published / archived) for owned patterns;
// falls back to a static badge when not editable.
function StatusControl({
  pattern,
  onSetStatus,
}: {
  pattern: Pattern;
  onSetStatus?: (status: string) => void;
}) {
  const { t } = useTranslation('patternsList');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!onSetStatus) return <StatusBadge status={pattern.status} />;

  const current = pattern.status || 'draft';
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1"
        title={t('changeStatus')}
      >
        <StatusBadge status={current} />
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setOpen(false);
                if (s.value !== current) onSetStatus(s.value);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${
                s.value === current ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span>{t(`status.${s.value}`, s.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Download split-button: lets the client export a pattern as CSV or Excel.
function PatternDownloadMenu({
  pattern,
  align = 'right',
  direction = 'down',
}: {
  pattern: Pattern;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
}) {
  const { t } = useTranslation('patternsList');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('download')}
        className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5"
      >
        <Download className="w-4 h-4" />
      </button>
      {open && (
        <div
          className={`absolute z-20 w-36 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${direction === 'up' ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          <button
            onClick={() => {
              setOpen(false);
              downloadPatternCsv(pattern);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            {t('downloadCsv')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              void downloadPatternXlsx(pattern);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            {t('downloadExcel')}
          </button>
        </div>
      )}
    </div>
  );
}

// Read-only assignment grid (mirrors the admin pattern view) for the preview.
function PatternGrid({ pattern }: { pattern: Pattern }) {
  const { t } = useTranslation('patternsList');
  const rows = parsePatternData(pattern.pattern_data);
  const cols = patternColumns(rows, pattern.game_type, t);
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{t('noRows')}</p>;
  }
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 w-12">#</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-500">{row.index ?? i + 1}</td>
              {cols.map((c) => {
                const v = row.assignments?.[c.key];
                return (
                  <td key={c.key} className="px-3 py-2 text-slate-900 font-medium">
                    {v == null ? <span className="text-slate-300">—</span> : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatternTable({ patterns, onPreview, getOnEdit, getOnSetStatus, getOnDelete, showStatus = true }: PatternTableProps) {
  const { t } = useTranslation('patternsList');
  return (
    <div className="rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">{t('table.name')}</th>
            <th className="px-4 py-2">{t('table.gameType')}</th>
            <th className="px-4 py-2">{t('table.version')}</th>
            {showStatus && <th className="px-4 py-2">{t('table.status')}</th>}
            <th className="px-4 py-2 text-right">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((pattern) => {
            const onEdit = getOnEdit(pattern);
            const onSetStatus = getOnSetStatus(pattern);
            const onDelete = getOnDelete(pattern);
            return (
              <tr key={pattern.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900">{pattern.name}</div>
                  {pattern.description && (
                    <div className="text-xs text-slate-500 line-clamp-1">{pattern.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded capitalize">
                    <GameTypeIcon type={pattern.game_type} className="w-3.5 h-3.5" />
                    {pattern.game_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">v{pattern.version || '1.0'}</td>
                {showStatus && (
                  <td className="px-4 py-2.5">
                    <StatusControl pattern={pattern} onSetStatus={onSetStatus} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onPreview(pattern)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{t('preview')}</span>
                    </button>
                    {onEdit && (
                      <button
                        onClick={onEdit}
                        title={t('edit')}
                        className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <PatternDownloadMenu pattern={pattern} />
                    {onDelete && (
                      <button
                        onClick={onDelete}
                        title={t('delete')}
                        className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MyPatternsView() {
  const { t } = useTranslation('patternsList');
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
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);

  const isOwner = (p: Pattern) =>
    !p.is_default && String(p.owner_id ?? '') === String(user?.client_id ?? '');

  const openNewPattern = () => {
    setEditingPattern(null);
    setShowBuilder(true);
  };
  const openEditPattern = (p: Pattern) => {
    setEditingPattern(p);
    setShowBuilder(true);
  };
  const closeBuilder = () => {
    setShowBuilder(false);
    setEditingPattern(null);
  };

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
        throw new Error(result.error || t('errors.fetch'));
      }

      const patternsData = result.data || [];
      setPatterns(patternsData);

      const types = Array.from(new Set(patternsData.map((p: Pattern) => p.game_type))) as string[];
      setGameTypes(types.sort());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.load'));
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

  // Sort by game type (then name) so patterns are grouped predictably.
  const byGameType = (a: Pattern, b: Pattern) =>
    a.game_type.localeCompare(b.game_type) || a.name.localeCompare(b.name);
  const defaultPatterns = filteredPatterns.filter((p) => p.is_default).sort(byGameType);
  const customPatterns = filteredPatterns.filter((p) => !p.is_default).sort(byGameType);

  const handlePreview = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setShowPreview(true);
  };

  const handleDelete = async (patternId: number) => {
    if (!confirm(t('confirmDelete'))) {
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
        throw new Error(result.error || t('errors.delete'));
      }

      setPatterns(patterns.filter((p) => p.id !== patternId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.delete'));
    }
  };

  const handlePublish = async (patternId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/patterns.php?action=publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': user?.token || '' },
        body: JSON.stringify({ id: patternId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        throw new Error(result.error || t('errors.publish'));
      }
      const updated = result.data as Pattern | undefined;
      setPatterns((prev) =>
        prev.map((p) =>
          p.id === patternId
            ? { ...p, status: updated?.status ?? 'published', version: updated?.version ?? p.version }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.publish'));
    }
  };

  const handleSetStatus = async (patternId: number, status: string) => {
    // Publishing bumps the version (same logic as admin); draft/archived are
    // plain status changes.
    if (status === 'published') {
      await handlePublish(patternId);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/patterns.php?action=update_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': user?.token || '' },
        body: JSON.stringify({ id: patternId, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        throw new Error(result.error || t('errors.updateStatus'));
      }
      setPatterns((prev) => prev.map((p) => (p.id === patternId ? { ...p, status } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.updateStatus'));
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

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={openNewPattern}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
        >
          <Plus className="w-4 h-4" />
          {t('newPattern')}
        </button>
        <HelpButton chapter="patterns" className="text-slate-400 hover:text-slate-700" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">{t('defaultPatterns')}</p>
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
              <p className="text-sm text-green-600 font-medium">{t('myCustomPatterns')}</p>
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
            placeholder={t('searchPlaceholder')}
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
            <option value="all">{t('allGameTypes')}</option>
            {gameTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-5">{t('defaultPatterns')}</h3>
        {defaultPatterns.length === 0 ? (
          <div className="text-center py-10">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {searchTerm || selectedGameType !== 'all' ? t('noDefaultMatch') : t('noDefaultAvailable')}
            </p>
          </div>
        ) : (
          <PatternTable
            patterns={defaultPatterns}
            onPreview={handlePreview}
            getOnEdit={() => undefined}
            getOnSetStatus={() => undefined}
            getOnDelete={() => undefined}
            showStatus={false}
          />
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-5">{t('myCustomPatterns')}</h3>
        {customPatterns.length === 0 ? (
          <div className="text-center py-10">
            <Plus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm mb-4">
              {searchTerm || selectedGameType !== 'all' ? t('noCustomMatch') : t('noCustomYet')}
            </p>
            {!(searchTerm || selectedGameType !== 'all') && (
              <button
                type="button"
                onClick={openNewPattern}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
              >
                <Plus className="w-4 h-4" />
                {t('createPattern')}
              </button>
            )}
          </div>
        ) : (
          <PatternTable
            patterns={customPatterns}
            onPreview={handlePreview}
            getOnEdit={(pattern) => (isOwner(pattern) ? () => openEditPattern(pattern) : undefined)}
            getOnSetStatus={(pattern) =>
              isOwner(pattern) ? (status: string) => handleSetStatus(pattern.id, status) : undefined
            }
            getOnDelete={(pattern) => (isOwner(pattern) ? () => handleDelete(pattern.id) : undefined)}
          />
        )}
      </div>

      {showPreview && selectedPattern && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedPattern.name}</h3>
                <span className="inline-flex items-center gap-1.5 mt-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded capitalize">
                  <GameTypeIcon type={selectedPattern.game_type} className="w-3.5 h-3.5" />
                  {selectedPattern.game_type}
                </span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span className="text-2xl text-slate-400">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <PatternGrid pattern={selectedPattern} />
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <PatternDownloadMenu pattern={selectedPattern} align="left" direction="up" />
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBuilder && (
        <PatternBuilderModal
          key={editingPattern?.id ?? 'new'}
          token={user?.token || ''}
          pattern={editingPattern}
          onClose={closeBuilder}
          onCreated={() => {
            closeBuilder();
            fetchPatterns();
          }}
        />
      )}
    </div>
  );
}
