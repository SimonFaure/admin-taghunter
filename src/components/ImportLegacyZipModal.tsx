import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, FileArchive, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { scenarioImportApi, ImportResult } from '../lib/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MAX_BYTES = 200 * 1024 * 1024;

interface Client {
  id: number;
  email: string;
  name?: string | null;
}

interface ImportLegacyZipModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Ownership = 'product' | 'client';

export function ImportLegacyZipModal({ open, onClose, onSuccess }: ImportLegacyZipModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [ownership, setOwnership] = useState<Ownership>('product');
  const [clientId, setClientId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setOwnership('product');
    setClientId(null);
    setSubmitting(false);
    setResult(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || ownership !== 'client' || clients.length > 0 || clientsLoading) return;
    let cancelled = false;
    (async () => {
      setClientsLoading(true);
      try {
        const r = await authFetch(`${API_BASE_URL}/clients.php?action=list`);
        const body = await r.json();
        if (cancelled) return;
        const fetched: Client[] = (body?.data as Client[]) || [];
        setClients(fetched);
      } catch {
        if (!cancelled) setError('Failed to load clients');
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownership, clients.length, clientsLoading]);

  const validateAndSetFile = (f: File) => {
    setError(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'zip') {
      setError('Only .zip files are accepted');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('ZIP exceeds 200 MB. Increase upload_max_filesize / post_max_size, or split the export.');
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
  };

  const canSubmit =
    !!file && !submitting && (ownership === 'product' || (ownership === 'client' && !!clientId));

  const handleImport = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await scenarioImportApi.importZip(file, ownership, ownership === 'client' ? clientId : null);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setResult(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onSuccess();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <FileArchive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import legacy Taghunter ZIP</h2>
              <p className="text-xs text-slate-500">Admin-only. Imports every <code>type=game</code> row in the ZIP.</p>
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
              <p className="text-sm text-slate-500 mt-1 text-center">
                This may take a few minutes for large ZIPs.<br />
                Do not close this tab.
              </p>
            </div>
          )}

          {!submitting && !result && (
            <>
              {error && (
                <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
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
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Upload className={`w-10 h-10 mx-auto mb-2 transition-colors ${dragActive ? 'text-slate-700' : 'text-slate-300'}`} />
                {file ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <FileArchive className="w-4 h-4 text-slate-600" />
                      <p className="font-semibold text-slate-900 break-all">{file.name}</p>
                    </div>
                    <p className="text-sm text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Drop ZIP here</p>
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
                      name="ownership"
                      value="product"
                      checked={ownership === 'product'}
                      onChange={() => setOwnership('product')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Import as product library</p>
                      <p className="text-xs text-slate-500">All games become Taghunter product templates with no client owner.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="ownership"
                      value="client"
                      checked={ownership === 'client'}
                      onChange={() => setOwnership('client')}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Assign to client</p>
                      <p className="text-xs text-slate-500 mb-2">All games are stored as that client's custom scenarios.</p>
                      {ownership === 'client' && (
                        <select
                          value={clientId ?? ''}
                          onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
                          disabled={clientsLoading}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          <option value="">{clientsLoading ? 'Loading clients…' : 'Select a client…'}</option>
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
                  <strong>Format:</strong> <code>main_export_file.csv</code> + <code>games/{'{slug}'}/csv/*.csv</code> + <code>games/{'{slug}'}/media/*</code>.
                </p>
                <p><strong>Game types:</strong> mystery and tagquest (survival rows are skipped).</p>
                <p><strong>Conflicts:</strong> scenarios whose <code>uniqid</code> already exists are skipped — delete them first to re-import.</p>
              </div>
            </>
          )}

          {!submitting && result && (
            <div>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
                <CheckCircle className="w-5 h-5 text-slate-700" />
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Import finished</p>
                  <p className="text-xs text-slate-500">
                    {result.summary.created} created · {result.summary.skipped} skipped · {result.summary.failed} failed · {result.summary.total} total
                  </p>
                </div>
              </div>

              {result.created.length > 0 && (
                <ResultSection title="Created" tone="success">
                  {result.created.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-slate-800 truncate">{row.title || row.slug}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {row.game_type} · {row.media_count} media
                      </span>
                    </li>
                  ))}
                </ResultSection>
              )}
              {result.skipped.length > 0 && (
                <ResultSection title="Skipped" tone="warn">
                  {result.skipped.map((row, i) => (
                    <li key={`${row.slug}-${i}`} className="flex items-baseline justify-between gap-3">
                      <span className="text-slate-800 truncate">{row.slug}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{row.reason}</span>
                    </li>
                  ))}
                </ResultSection>
              )}
              {result.failed.length > 0 && (
                <ResultSection title="Failed" tone="error">
                  {result.failed.map((row, i) => (
                    <li key={`${row.slug}-${i}`}>
                      <p className="font-medium text-slate-800">{row.slug}</p>
                      <p className="text-xs text-red-600 break-all">{row.error}</p>
                    </li>
                  ))}
                </ResultSection>
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
              <button
                onClick={handleDone}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'success' | 'warn' | 'error';
  children: React.ReactNode;
}) {
  const toneClasses = {
    success: 'border-green-200 bg-green-50',
    warn: 'border-amber-200 bg-amber-50',
    error: 'border-red-200 bg-red-50',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle : tone === 'warn' ? AlertTriangle : AlertCircle;
  const iconClass = tone === 'success' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-red-600';
  return (
    <div className={`mb-3 border rounded-xl ${toneClasses}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-current/10">
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <p className="text-sm font-semibold text-slate-800">{title}</p>
      </div>
      <ul className="px-4 py-2 text-sm space-y-1.5">{children}</ul>
    </div>
  );
}
