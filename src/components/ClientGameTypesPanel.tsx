import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { GameTypeIcon } from './icons/GameTypeIcons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface GameTypeRow {
  code: string;
  name: string;
  enabled: boolean; // global
}
interface Override {
  game_type_code: string;
  enabled: boolean | null; // per-client: null = inherit (allowed), false = disabled
}

interface Props {
  clientId: number;
}

/**
 * Admin per-client game-type availability (on the client detail page). The
 * per-client setting OVERRIDES the global default (tri-state): a client can be
 * force-enabled for a globally-disabled type (e.g. an early-access pilot) or
 * force-disabled for a globally-enabled one. Untouched = inherit global.
 * Effective visibility = override.enabled (when set) else global enabled.
 * See plans/disable-game-types.md.
 */
export function ClientGameTypesPanel({ clientId }: Props) {
  const [types, setTypes] = useState<GameTypeRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/game_types.php?action=list&client_id=${clientId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTypes((json.game_types || []) as GameTypeRow[]);
      const overs: Record<string, Override> = {};
      for (const o of (json.overrides ? Object.values(json.overrides) : []) as Override[]) {
        overs[o.game_type_code] = o;
      }
      setOverrides(overs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game types');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-client override: true (force on) | false (force off) | null/undefined (inherit).
  const overrideOf = (code: string): boolean | null => {
    const o = overrides[code];
    return o && o.enabled !== null && o.enabled !== undefined ? o.enabled : null;
  };

  // enabled: true -> force on, false -> force off, null -> reset to inherit global.
  const setClientEnabled = async (code: string, enabled: boolean | null) => {
    setBusyCode(code);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/game_types.php?action=admin_set_client_enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, code, enabled }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setOverrides((prev) => ({
        ...prev,
        [code]: { game_type_code: code, enabled },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusyCode(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Control which game types this client can see, create, and sync. A per-client
        setting overrides the global default - you can grant a type that's disabled
        platform-wide, or hide one that's globally enabled. Untouched types follow global.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {types.map((t) => {
          const globallyOn = t.enabled;
          const override = overrideOf(t.code); // true | false | null (inherit)
          const effective = override === null ? globallyOn : override;
          const isOverriding = override !== null && override !== globallyOn;
          return (
            <li key={t.code} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <GameTypeIcon type={t.code} className="h-5 w-5 text-slate-500" />
                <div>
                  <div className="font-medium capitalize text-slate-900">{t.name || t.code}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        effective ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {effective ? 'Visible to client' : 'Hidden from client'}
                    </span>
                    <span className="text-slate-400">
                      global {globallyOn ? 'ON' : 'OFF'}
                      {override === null
                        ? ' · inheriting'
                        : isOverriding
                          ? ` · overridden ${override ? 'ON' : 'OFF'}`
                          : ` · client ${override ? 'ON' : 'OFF'}`}
                    </span>
                    {override !== null && (
                      <button
                        onClick={() => setClientEnabled(t.code, null)}
                        disabled={busyCode === t.code}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title="Clear the per-client override and follow the global default"
                      >
                        reset to global
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={effective}
                disabled={busyCode === t.code}
                onClick={() => setClientEnabled(t.code, !effective)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  effective ? 'bg-emerald-500' : 'bg-slate-300'
                } ${busyCode === t.code ? 'opacity-50' : ''}`}
                title={effective ? 'Hide from this client' : 'Show to this client'}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    effective ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
