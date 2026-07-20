import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, AlertTriangle, Copy, Check, ShieldCheck } from 'lucide-react';
import { recoveryCodesApi, RecoveryCodeEntry } from '../lib/api';

interface RecoveryCodesPanelProps {
  clientId: number;
}

// Per-client offline PIN-recovery codes, rendered inline inside the client
// detail page. The admin reads one to an operator who has forgotten the device
// PIN at an offline event; the playground validates it locally and clears the
// PIN. "Regenerate all" issues a fresh set and invalidates the old - but only
// on a device AFTER it re-syncs, so regenerate while devices are online.
//
// The server auto-provisions a pool on first view (get_pool), so this always
// shows codes even for clients created before the feature.

// "12345678" -> "12 34 56 78" for easy read-aloud.
function formatCode(code: string): string {
  return code.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function formatUsedAt(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function RecoveryCodesPanel({ clientId }: RecoveryCodesPanelProps) {
  const [codes, setCodes] = useState<RecoveryCodeEntry[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchPool = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await recoveryCodesApi.getPool(clientId);
      if (res.error) setError(res.error);
      else if (res.data) {
        setCodes(res.data.codes ?? []);
        setVersion(res.data.version ?? 0);
      }
    } catch {
      setError('Failed to load recovery codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await recoveryCodesApi.regenerate(clientId);
      if (res.error) setError(res.error);
      else if (res.data) {
        setCodes(res.data.codes ?? []);
        setVersion(res.data.version ?? 0);
      }
    } catch {
      setError('Failed to regenerate codes');
    } finally {
      setRegenerating(false);
      setConfirmRegen(false);
    }
  };

  const handleCopy = async (entry: RecoveryCodeEntry) => {
    try {
      await navigator.clipboard.writeText(entry.code);
      setCopiedIndex(entry.code_index);
      setTimeout(() => setCopiedIndex((i) => (i === entry.code_index ? null : i)), 1500);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  const usedCount = codes.filter((c) => c.used_at).length;

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">
        Read one of these to an operator who has forgotten the device PIN at an
        offline event. Each code works <strong>once per device</strong>, then
        clears that device’s PIN. Codes sync to the client’s devices while
        they’re online - regenerate before sending devices to an offline event.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-lg">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm">No recovery codes yet.</p>
          <p className="text-xs mt-1">Click “Regenerate all” to issue a pool.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">
              {version > 0 ? `v${version} · ` : ''}
              {codes.length} codes · {usedCount} used
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {codes.map((entry) => (
              <div
                key={entry.code_index}
                className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-lg ${
                  entry.used_at ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`font-mono text-base tracking-wider ${
                      entry.used_at ? 'text-slate-400 line-through' : 'text-slate-900'
                    }`}
                  >
                    {formatCode(entry.code)}
                  </div>
                  {entry.used_at ? (
                    <div className="text-[11px] text-slate-500 truncate">
                      {entry.used_context === 'billing'
                        ? 'billing reprieve'
                        : entry.used_context === 'pin'
                        ? 'PIN reset'
                        : 'used'}{' '}
                      · {entry.used_device_label ?? 'a device'} · {formatUsedAt(entry.used_at)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-600">unused</div>
                  )}
                </div>
                {!entry.used_at && (
                  <button
                    onClick={() => handleCopy(entry)}
                    className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors flex-shrink-0"
                    title="Copy code"
                  >
                    {copiedIndex === entry.code_index ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 pt-4 border-t border-slate-200">
        {confirmRegen ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 text-amber-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>
                Replace all {codes.length > 0 ? codes.length : 10} codes? The current ones
                stop working once each device re-syncs (a still-offline device keeps
                honoring the old codes until then).
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setConfirmRegen(false)}
                disabled={regenerating}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-4 py-2 flex items-center gap-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {regenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  'Yes, regenerate'
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRegen(true)}
            disabled={loading}
            className="px-4 py-2 flex items-center gap-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerate all
          </button>
        )}
      </div>
    </div>
  );
}
