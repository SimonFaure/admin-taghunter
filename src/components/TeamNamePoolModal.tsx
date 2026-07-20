import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, FileText, Tags, RefreshCw, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import {
  teamNamePoolsApi,
  TeamNamePools,
  TeamNamePoolMeta,
  TeamNameAudience,
  TeamNamePoolScope,
} from '../lib/api';
import { SUPPORTED_LANGS } from '../scenarios/i18n/types';
import { AUDIENCE_OPTIONS, getAudienceLabel } from '../types/audience';

interface TeamNamePoolModalProps {
  scope: TeamNamePoolScope; // 'global' (admin catalog) or a numeric client_id
  clientName?: string;
  onClose: () => void;
}

type Tab = 'names' | 'upload';

// Canonical audience trio (mini_kids / kids / ado_adultes) - shared with the
// scenario editor's audience picker.
const AUDIENCES = AUDIENCE_OPTIONS;

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português',
  nl: 'Nederlands', pl: 'Polski', ru: 'Русский', ja: '日本語', zh: '中文', ar: 'العربية',
};

export function TeamNamePoolModal({ scope, clientName, onClose }: TeamNamePoolModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('names');
  const [audience, setAudience] = useState<TeamNameAudience>('kids');
  const [language, setLanguage] = useState<string>('fr');
  const [pools, setPools] = useState<TeamNamePools>({});
  const [meta, setMeta] = useState<TeamNamePoolMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newNames, setNewNames] = useState('');
  const [saving, setSaving] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<{ added: number; skipped: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const title = scope === 'global' ? 'Team Name Catalog' : `Team Names - ${clientName ?? `Client ${scope}`}`;

  const fetchPool = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, poolRes] = await Promise.all([
        teamNamePoolsApi.getPoolMeta(scope),
        teamNamePoolsApi.getPool(scope),
      ]);
      if (metaRes.data) setMeta(metaRes.data.data);
      if (poolRes.data) setPools(poolRes.data.pools ?? {});
      if (poolRes.error) setError(poolRes.error);
    } catch {
      setError('Failed to load name pool');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = pools[audience]?.[language] ?? [];

  const handleAdd = async () => {
    // Accept a pasted list: split on newlines and commas.
    const names = newNames
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await teamNamePoolsApi.addNames(scope, audience, language, names);
      if (res.error) {
        setError(res.error);
      } else {
        setNewNames('');
        await fetchPool();
      }
    } catch {
      setError('Failed to add names');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const res = await teamNamePoolsApi.deleteNames(scope, [id]);
      if (res.error) setError(res.error);
      else await fetchPool();
    } catch {
      setError('Failed to delete name');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    if (file.name.split('.').pop()?.toLowerCase() !== 'csv') {
      setUploadError('Only CSV files are allowed');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await teamNamePoolsApi.uploadCsv(scope, selectedFile);
      if (res.error) {
        setUploadError(res.error);
      } else if (res.data) {
        setUploadSuccess({ added: res.data.added, skipped: res.data.skipped });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchPool();
        setActiveTab('names');
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const totalForAudience = (a: TeamNameAudience) =>
    Object.values(meta?.counts?.[a] ?? {}).reduce((s, n) => s + n, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <Tags className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {meta && meta.current_version > 0 && (
                <p className="text-xs text-slate-500">v{meta.current_version}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-white px-6">
          {(['names', 'upload'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'names' ? 'Manage Names' : 'Import CSV'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {activeTab === 'names' && (
            <div className="p-6">
              {/* Audience tabs */}
              <div className="flex gap-2 mb-4">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAudience(a.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      audience === a.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {a.label}
                    <span className="ml-2 text-xs opacity-70">{totalForAudience(a.value)}</span>
                  </button>
                ))}
              </div>

              {/* Language selector */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm text-slate-600">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {SUPPORTED_LANGS.map((code) => (
                    <option key={code} value={code}>
                      {LANG_NAMES[code] ?? code} ({code})
                    </option>
                  ))}
                </select>
                <button
                  onClick={fetchPool}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <span className="text-sm text-slate-500 ml-auto">{entries.length} names</span>
              </div>

              {/* Add names */}
              <div className="flex gap-2 mb-4">
                <textarea
                  value={newNames}
                  onChange={(e) => setNewNames(e.target.value)}
                  placeholder="Add one or more names (one per line, or comma-separated)"
                  rows={2}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  onClick={handleAdd}
                  disabled={saving || newNames.trim() === ''}
                  className="px-4 self-stretch flex items-center gap-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Names list */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Tags className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                  <p className="text-sm">No names yet for {getAudienceLabel(audience)} / {language}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-900 truncate">{entry.name}</span>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="p-6 max-w-xl mx-auto">
              {uploadSuccess && (
                <div className="mb-5 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Import complete</p>
                    <p className="text-sm">{uploadSuccess.added} added &middot; {uploadSuccess.skipped} skipped</p>
                  </div>
                </div>
              )}
              {uploadError && (
                <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{uploadError}</p>
                </div>
              )}

              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
                  dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSetFile(f); }} className="hidden" />
                <Upload className={`w-12 h-12 mx-auto mb-3 transition-colors ${dragActive ? 'text-slate-700' : 'text-slate-300'}`} />
                {selectedFile ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-slate-600" />
                      <p className="font-semibold text-slate-900">{selectedFile.name}</p>
                    </div>
                    <p className="text-sm text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB &middot; Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Drop CSV file here</p>
                    <p className="text-sm text-slate-400">or click to browse</p>
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Required CSV Format</p>
                <p className="text-xs text-slate-500 font-mono">audience, language, name</p>
                <p className="text-xs text-slate-400 mt-1">audience = mini_kids | kids | ado_adultes; language = en, fr, es, … Duplicate names (per audience+language) are skipped.</p>
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
