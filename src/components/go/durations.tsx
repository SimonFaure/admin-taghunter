import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Loader2, Plus, X } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { formatDuration } from '../../lib/goRanking';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// GO / Spot "challenges" = the game durations an operator offers
// (project_go_spot_durations). Two levels, both edited with the pieces below:
//   - the client's CATALOG of minutes, shared by GO and Spot;
//   - per (scenario, app), which of those minutes are offered to players.
// Both surfaces (the client's QR page and the admin's client page) use these
// components; `clientId` is only passed by the admin — a client always acts on
// itself and the backend ignores any client_id it sends.

// Formatting lives in lib/goRanking (the boards need it too); re-exported here
// so the editors and the boards can never drift apart on how a challenge reads.
export { formatDuration } from '../../lib/goRanking';

/** The client's duration catalog + its save call. */
export function useDurationCatalog(clientId?: string | number | null) {
  const [catalog, setCatalog] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const qs = clientId ? `&client_id=${encodeURIComponent(String(clientId))}` : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/go.php?action=duration_catalog${qs}`);
      if (res.ok) {
        const json = await res.json();
        setCatalog((json.data?.catalog ?? []) as number[]);
      }
    } catch (err) {
      console.error('Failed to load the duration catalog:', err);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(
    async (next: number[]) => {
      // Optimistic: the list is the operator's own input, and a failed save
      // leaves the server value untouched for the next load.
      setCatalog(next);
      await authFetch(`${API_BASE_URL}/go.php?action=duration_catalog_save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: next, ...(clientId ? { client_id: clientId } : {}) }),
      });
    },
    [clientId],
  );

  return { catalog, loading, save };
}

/** The catalog editor: add a duration, remove one. */
export function DurationCatalogCard({
  catalog,
  onSave,
  loading,
}: {
  catalog: number[];
  onSave: (next: number[]) => void | Promise<void>;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1 || n > 600) return;
    if (!catalog.includes(n)) void onSave([...catalog, n].sort((a, b) => a - b));
    setDraft('');
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-5 w-5 text-slate-500" />
        <h2 className="font-semibold text-slate-900">{t('goViews:durations.catalogTitle')}</h2>
      </div>
      <p className="mb-3 text-sm text-slate-500">{t('goViews:durations.catalogHint')}</p>

      <div className="flex flex-wrap items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          catalog.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1.5 pl-3 pr-1.5 text-sm font-medium text-slate-700"
            >
              {formatDuration(m)}
              <button
                type="button"
                onClick={() => void onSave(catalog.filter((v) => v !== m))}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title={t('goViews:durations.remove')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))
        )}

        <span className="inline-flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={600}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('goViews:durations.minutes')}
            className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> {t('goViews:durations.add')}
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The per-scenario offer: tick which catalog durations this scenario proposes in
 * this app. One tick = that clock is applied silently; several = the player picks
 * on the setup screen ("Votre défi"). None = the scenario's authored time.
 */
export function ScenarioDurationPicker({
  clientId,
  scenarioId,
  app,
  catalog,
  initial,
}: {
  clientId?: string | number | null;
  scenarioId: string | number;
  app: 'go' | 'spot';
  catalog: number[];
  initial: number[];
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number[]>(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // A grant can hold a duration that has since left the catalog — keep showing
  // it (ticked) so the operator can actually un-tick it.
  const options = Array.from(new Set([...catalog, ...selected])).sort((a, b) => a - b);

  const toggle = async (m: number) => {
    const next = selected.includes(m) ? selected.filter((v) => v !== m) : [...selected, m].sort((a, b) => a - b);
    setSelected(next);
    setSaving(true);
    try {
      await authFetch(`${API_BASE_URL}/go.php?action=duration_scenario_save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          app,
          durations: next,
          ...(clientId ? { client_id: clientId } : {}),
        }),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {t('goViews:durations.offered')}
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {saved && !saving && <Check className="h-3 w-3 text-emerald-500" />}
      </div>
      {!options.length ? (
        <p className="text-xs text-slate-400">{t('goViews:durations.noneInCatalog')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((m) => {
            const on = selected.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => void toggle(m)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {formatDuration(m)}
              </button>
            );
          })}
        </div>
      )}
      {!selected.length && options.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-400">{t('goViews:durations.fallbackHint')}</p>
      )}
    </div>
  );
}
