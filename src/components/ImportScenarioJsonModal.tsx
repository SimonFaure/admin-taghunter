import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Upload, FileJson, CheckCircle, AlertCircle, AlertTriangle, Loader2, Pencil } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { scenarioJsonImportApi, JsonImportResult, JsonImportFailure } from '../lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MAX_BYTES = 200 * 1024 * 1024;

interface Client {
  id: number;
  email: string;
  name?: string | null;
}

interface ImportScenarioJsonModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Ownership = 'product' | 'client';

/**
 * Admin-only import of ONE scenario authored outside Studio (Clash for now):
 * a scenario.json, or a ZIP holding scenario.json + its media files.
 * Format: docs/clash-scenario-import-format.md. Backend: scenario_import_json.php.
 */
export function ImportScenarioJsonModal({ open, onClose, onSuccess }: ImportScenarioJsonModalProps) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [ownership, setOwnership] = useState<Ownership>('product');
  const [clientId, setClientId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<JsonImportResult | null>(null);
  const [failure, setFailure] = useState<JsonImportFailure | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setOwnership('product');
    setClientId(null);
    setClientsLoaded(false);
    setSubmitting(false);
    setResult(null);
    setFailure(null);
  }, [open]);

  // clientsLoading must NOT be a dependency (see ImportLegacyZipModal).
  useEffect(() => {
    if (!open || ownership !== 'client' || clientsLoaded) return;
    let cancelled = false;
    setClientsLoading(true);
    (async () => {
      try {
        const r = await authFetch(`${API_BASE_URL}/clients.php?action=list`);
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        setClients((body?.data as Client[]) || []);
        setClientsLoaded(true);
      } catch {
        if (!cancelled) setFailure({ error: 'Failed to load licensees' });
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownership, clientsLoaded]);

  const validateAndSetFile = (f: File) => {
    setFailure(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && ext !== 'zip') {
      setFailure({ error: 'Only .json or .zip files are accepted' });
      return;
    }
    if (f.size > MAX_BYTES) {
      setFailure({ error: 'File exceeds 200 MB' });
      return;
    }
    setFile(f);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) validateAndSetFile(picked);
    e.target.value = '';
  };

  const canSubmit =
    !!file && !submitting && (ownership === 'product' || (ownership === 'client' && !!clientId));

  const handleImport = async () => {
    if (!file) return;
    setSubmitting(true);
    setFailure(null);
    setResult(null);
    const res = await scenarioJsonImportApi.importFile(file, ownership, ownership === 'client' ? clientId : null);
    if (res.failure) setFailure(res.failure);
    else if (res.data) setResult(res.data);
    setSubmitting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <FileJson className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import scenario (JSON)</h2>
              <p className="text-xs text-slate-500">Admin-only. One Clash scenario, created as a draft.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {submitting && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-12 h-12 text-slate-700 animate-spin mb-4" />
              <p className="font-semibold text-slate-900">Importing…</p>
            </div>
          )}

          {!submitting && !result && (
            <>
              {failure && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{failure.error}</p>
                  </div>
                  {failure.errors && failure.errors.length > 0 && (
                    <ul className="mt-2 ml-8 list-disc text-xs space-y-1 break-words">
                      {failure.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                  dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Upload className={`w-10 h-10 mx-auto mb-2 transition-colors ${dragActive ? 'text-slate-700' : 'text-slate-300'}`} />
                {file ? (
                  <div>
                    <p className="font-semibold text-slate-900 break-all mb-1">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Drop scenario.json or a ZIP here</p>
                    <p className="text-sm text-slate-400">or click to browse · max 200 MB</p>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Ownership</p>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="json-ownership"
                      value="product"
                      checked={ownership === 'product'}
                      onChange={() => setOwnership('product')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Import as product library</p>
                      <p className="text-xs text-slate-500">Taghunter product scenario with no licensee owner.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="json-ownership"
                      value="client"
                      checked={ownership === 'client'}
                      onChange={() => setOwnership('client')}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Assign to licensee</p>
                      <p className="text-xs text-slate-500 mb-2">Stored as that licensee's custom scenario.</p>
                      {ownership === 'client' && (
                        <select
                          value={clientId ?? ''}
                          onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
                          disabled={clientsLoading}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          <option value="">{clientsLoading ? 'Loading licensees…' : 'Select a licensee…'}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || c.email} ({c.email})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p>
                  <strong>Format:</strong> <code>scenario.json</code> alone, or a ZIP with <code>scenario.json</code> + <code>media/*</code> (images, sounds, fonts).
                </p>
                <p><strong>Game types:</strong> Clash.</p>
                <p><strong>Media:</strong> files referenced but not in the upload are left empty - upload them in the editor.</p>
              </div>
            </>
          )}

          {!submitting && result && (
            <div>
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{result.scenario.title}</p>
                  <p className="text-xs text-slate-500">
                    Created as draft · {result.scenario.game_type} · {result.media_count} media
                  </p>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-semibold text-slate-800">{result.warnings.length} warning(s)</p>
                  </div>
                  <ul className="px-4 py-2 text-xs text-slate-700 space-y-1 list-disc ml-4 break-words">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {!submitting && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
            {!result ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onSuccess}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-white"
                >
                  Done
                </button>
                <button
                  onClick={() => {
                    onSuccess();
                    navigate(`/studio/scenarios/${result.scenario.uniqid}`);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
                >
                  <Pencil className="w-4 h-4" />
                  Open in editor
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
