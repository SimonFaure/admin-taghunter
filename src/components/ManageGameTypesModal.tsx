import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { GameTypeIcon } from './icons/GameTypeIcons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface GameTypeRow {
  code: string;
  name: string;
  enabled: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful global change so the parent can refresh. */
  onChanged?: () => void;
}

/**
 * Admin-only modal (launched from the Scenarios page) to enable/disable game
 * types GLOBALLY. A global disable hides the type from every client, blocks
 * client creation, and stops syncing that type's scenarios to playground
 * (purged on the next online sync). Per-client narrowing lives on the client
 * detail page. See plans/disable-game-types.md.
 */
export function ManageGameTypesModal({ open, onClose, onChanged }: Props) {
  const [types, setTypes] = useState<GameTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/game_types.php?action=list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTypes((json.game_types || []) as GameTypeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const setEnabled = async (code: string, enabled: boolean) => {
    // Confirm high-impact global disables with a live count of what's affected.
    if (!enabled) {
      let msg = `Disable "${code}" globally?\n\nClients that inherit the global default won't see or be able to create this game type, and its scenarios stop syncing to playground (removed on next online sync). Clients explicitly enabled for this type keep access.`;
      try {
        const imp = await authFetch(`${API_BASE_URL}/game_types.php?action=admin_disable_impact&code=${encodeURIComponent(code)}`);
        if (imp.ok) {
          const j = await imp.json();
          msg = `Disable "${code}" globally?\n\nUp to ${j.scenario_count} published scenario(s) across ${j.client_count} client(s) are affected - those will stop syncing and be removed on the next online sync. Clients with an explicit per-client override for this type keep access.\n\nAlready-downloaded copies on offline devices remain until they reconnect.`;
        }
      } catch {
        /* fall back to the generic message */
      }
      if (!confirm(msg)) return;
    }

    setBusyCode(code);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/game_types.php?action=admin_set_global_enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, enabled }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, enabled } : t)));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update game type');
    } finally {
      setBusyCode(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Manage game types</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-sm text-slate-500">
            This is the global default. Disabling a type hides it from clients, blocks
            creation, and stops syncing its scenarios to playground. Admins can still
            author disabled types here in Studio. Per-client overrides on each client's
            detail page take precedence - you can grant a disabled type to a specific client.
          </p>

          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {types.map((t) => (
                <li key={t.code} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <GameTypeIcon type={t.code} className="h-5 w-5 text-slate-500" />
                    <div>
                      <div className="font-medium capitalize text-slate-900">{t.name || t.code}</div>
                      <div className="text-xs text-slate-400">
                        {t.enabled ? 'Available to clients' : 'Disabled platform-wide'}
                      </div>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={t.enabled}
                    disabled={busyCode === t.code}
                    onClick={() => setEnabled(t.code, !t.enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                      t.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                    } ${busyCode === t.code ? 'opacity-50' : ''}`}
                    title={t.enabled ? 'Disable globally' : 'Enable globally'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        t.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
