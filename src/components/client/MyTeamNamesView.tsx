import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tags, RefreshCw, Plus, Trash2, AlertCircle, Lock, Upload, FileText, CheckCircle } from 'lucide-react';
import { teamNamesClientApi, TeamNamePoolPayload } from '../../lib/teamNamesClientApi';
import type { TeamNameAudience } from '../../lib/api';
import { SUPPORTED_LANGS } from '../../scenarios/i18n/types';
import { AUDIENCE_OPTIONS, getAudienceLabel } from '../../types/audience';
import { useAuth } from '../../auth/AuthContext';
import { HelpButton } from '../../help';

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português',
  nl: 'Nederlands', pl: 'Polski', ru: 'Русский', ja: '日本語', zh: '中文', ar: 'العربية',
};

const EMPTY: TeamNamePoolPayload = { version: 0, pools: {}, counts: {} };

export function MyTeamNamesView() {
  const { t } = useTranslation('client');
  const { user } = useAuth();

  const [audience, setAudience] = useState<TeamNameAudience>('kids');
  const [language, setLanguage] = useState<string>(
    user?.language && SUPPORTED_LANGS.includes(user.language as never) ? user.language : 'fr'
  );

  const [catalog, setCatalog] = useState<TeamNamePoolPayload>(EMPTY);
  const [mine, setMine] = useState<TeamNamePoolPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newNames, setNewNames] = useState('');
  const [saving, setSaving] = useState(false);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ added: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, own] = await Promise.all([
        teamNamesClientApi.getCatalog(),
        teamNamesClientApi.getMyPool(),
      ]);
      setCatalog(cat);
      setMine(own);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team names');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogEntries = catalog.pools[audience]?.[language] ?? [];
  const myEntries = mine.pools[audience]?.[language] ?? [];

  const myCountFor = (a: TeamNameAudience) =>
    Object.values(mine.counts?.[a] ?? {}).reduce((s, n) => s + n, 0);

  const handleAdd = async () => {
    const names = newNames
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await teamNamesClientApi.addNames(audience, language, names);
      setNewNames('');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add names');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await teamNamesClientApi.deleteNames([id]);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete name');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const doUpload = async (file: File) => {
    if (file.name.split('.').pop()?.toLowerCase() !== 'csv') {
      setError('Only CSV files are allowed');
      return;
    }
    setUploading(true);
    setError(null);
    setUploadMsg(null);
    try {
      const res = await teamNamesClientApi.uploadCsv(file);
      setUploadMsg({ added: res.added, skipped: res.skipped });
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
            <Tags className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('teamNames.title')}</h1>
            <p className="text-sm text-slate-500">{t('teamNames.subtitle')}</p>
          </div>
        </div>
        <HelpButton chapter="cards" label={t('teamNames.help')} className="text-slate-500 hover:text-slate-800" />
      </div>

      {/* Audience tabs + language selector */}
      <div className="flex flex-wrap items-center gap-2 mt-6 mb-4">
        {AUDIENCE_OPTIONS.map((a) => (
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
            <span className="ml-2 text-xs opacity-70">{myCountFor(a.value)}</span>
          </button>
        ))}
        <div className="flex items-center gap-3 ml-auto">
          <label className="text-sm text-slate-600">{t('teamNames.language')}</label>
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
            onClick={fetchAll}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title={t('teamNames.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Read-only default catalog */}
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">{t('teamNames.catalogTitle')}</h2>
              </div>
              <span className="text-xs text-slate-500">{catalogEntries.length}</span>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-400 mb-3">{t('teamNames.catalogHint')}</p>
              {catalogEntries.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">
                  {t('teamNames.emptyCatalog', { audience: getAudienceLabel(audience), language })}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catalogEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 border border-slate-100 bg-slate-50 rounded-lg text-sm text-slate-600 truncate"
                    >
                      {entry.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Editable: my own names */}
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-900">{t('teamNames.myTitle')}</h2>
              <span className="text-xs text-slate-500">{myEntries.length}</span>
            </div>
            <div className="p-5">
              {/* Add names */}
              <div className="flex gap-2 mb-4">
                <textarea
                  value={newNames}
                  onChange={(e) => setNewNames(e.target.value)}
                  placeholder={t('teamNames.addPlaceholder')}
                  rows={2}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  onClick={handleAdd}
                  disabled={saving || newNames.trim() === ''}
                  className="px-4 self-stretch flex items-center gap-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('teamNames.add')}
                </button>
              </div>

              {/* My names list */}
              {myEntries.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  {t('teamNames.emptyMine', { audience: getAudienceLabel(audience), language })}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {myEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-900 truncate">{entry.name}</span>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                        title={t('teamNames.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* CSV import */}
              {uploadMsg && (
                <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{t('teamNames.importResult', { added: uploadMsg.added, skipped: uploadMsg.skipped })}</span>
                </div>
              )}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                  dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                    {t('teamNames.importing')}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Upload className="w-4 h-4" />
                    {t('teamNames.importCta')}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                  <FileText className="w-3 h-3" /> audience, language, name
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
