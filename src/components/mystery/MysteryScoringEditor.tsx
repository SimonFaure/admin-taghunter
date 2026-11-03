import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Loader2, Save, Search, Users } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { AUDIENCE_BANDS, getBandLabel, type AudienceBand } from '../../types/audience';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Licensee Mystery scoring defaults (backend/api/mystery_scoring.php,
// clients.mystery_scoring). Two levels, both override the scenario's own values
// in the playground, per field:
//   per-scenario row  >  age band (the scenario's YOUNGEST band)  >  scenario.
// Blank = not set (falls through). Used by the licensee page (/my/mystery-scoring)
// and the admin licensee page; `clientId` is only passed by the admin.

const SCORING_FIELDS = [
  'good_answer_points',
  'wrong_answer_points',
  'malus_both_answers_biped',
  'malus_no_answer',
] as const;
type Field = (typeof SCORING_FIELDS)[number];
type FieldSet = Partial<Record<Field, string>>;

interface Scoring {
  by_age: Partial<Record<AudienceBand, FieldSet>>;
  by_scenario: Record<string, FieldSet>;
}

interface ScenarioRow {
  uniqid: string;
  title: string;
  is_product: boolean;
  bands: AudienceBand[];
  age_band: AudienceBand | null;
}

// Fields whose value is expected negative (a penalty).
const NEGATIVE: ReadonlySet<Field> = new Set(['wrong_answer_points', 'malus_both_answers_biped', 'malus_no_answer']);

function toDraftSet(raw: unknown): FieldSet {
  const out: FieldSet = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of SCORING_FIELDS) {
    const v = (raw as Record<string, unknown>)[f];
    if (v !== null && v !== undefined && v !== '') out[f] = String(v);
  }
  return out;
}

function toDraft(raw: unknown): Scoring {
  const r = (raw ?? {}) as { by_age?: Record<string, unknown>; by_scenario?: Record<string, unknown> };
  const byAge: Scoring['by_age'] = {};
  for (const [k, v] of Object.entries(r.by_age ?? {})) byAge[k as AudienceBand] = toDraftSet(v);
  const byScenario: Scoring['by_scenario'] = {};
  for (const [k, v] of Object.entries(r.by_scenario ?? {})) byScenario[k] = toDraftSet(v);
  return { by_age: byAge, by_scenario: byScenario };
}

// Draft -> payload: ints only, blanks dropped (the server normalizes again).
function toPayloadSet(set: FieldSet | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of SCORING_FIELDS) {
    const s = (set?.[f] ?? '').trim();
    if (s === '' || s === '-') continue;
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) out[f] = f === 'wrong_answer_points' ? -Math.abs(n) : n;
  }
  return out;
}

function toPayload(d: Scoring) {
  const byAge: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(d.by_age)) {
    const p = toPayloadSet(v);
    if (Object.keys(p).length) byAge[k] = p;
  }
  const byScenario: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(d.by_scenario)) {
    const p = toPayloadSet(v);
    if (Object.keys(p).length) byScenario[k] = p;
  }
  return { by_age: byAge, by_scenario: byScenario };
}

// Keep what a user can type on the way to a signed integer.
const sanitize = (s: string) => s.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');

function NumberCell({
  value,
  placeholder,
  onChange,
  field,
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  field: Field;
  ariaLabel: string;
}) {
  const n = parseInt(value, 10);
  // A positive malus is allowed (it is a bonus) but rarely meant: flag it.
  const warn = NEGATIVE.has(field) && field !== 'wrong_answer_points' && Number.isFinite(n) && n > 0;
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(sanitize(e.target.value))}
      className={`w-full min-w-[4.5rem] rounded-md border px-2.5 py-1.5 text-sm tabular-nums focus:border-slate-900 focus:outline-none ${
        warn ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
      }`}
    />
  );
}

export function MysteryScoringEditor({ clientId }: { clientId?: string | number | null }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Scoring>({ by_age: {}, by_scenario: {} });
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const qs = clientId ? `&client_id=${encodeURIComponent(String(clientId))}` : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/mystery_scoring.php?action=get${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error === 'not_migrated' ? t('mysteryScoring:notMigrated') : t('mysteryScoring:loadFailed'));
        return;
      }
      setDraft(toDraft(json.data?.scoring));
      setScenarios((json.data?.scenarios ?? []) as ScenarioRow[]);
      setDirty(false);
    } catch {
      setError(t('mysteryScoring:loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [qs, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAge = (band: AudienceBand, field: Field, v: string) => {
    setDraft((d) => ({ ...d, by_age: { ...d.by_age, [band]: { ...d.by_age[band], [field]: v } } }));
    setDirty(true);
  };
  const setScenario = (uniqid: string, field: Field, v: string) => {
    setDraft((d) => ({ ...d, by_scenario: { ...d.by_scenario, [uniqid]: { ...d.by_scenario[uniqid], [field]: v } } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/mystery_scoring.php?action=save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoring: toPayload(draft), ...(clientId ? { client_id: clientId } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t('mysteryScoring:saveFailed'));
        return;
      }
      setDraft(toDraft(json.scoring));
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      setError(t('mysteryScoring:saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const fieldLabel = (f: Field) => t(`mysteryScoring:fields.${f}`);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? scenarios.filter((s) => s.title.toLowerCase().includes(q)) : scenarios;
  }, [scenarios, query]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('mysteryScoring:loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p>{t('mysteryScoring:intro')}</p>
        <p className="mt-1.5 text-slate-500">{t('mysteryScoring:precedence')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* By age */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          <h2 className="font-semibold text-slate-900">{t('mysteryScoring:byAgeTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">{t('mysteryScoring:byAgeHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-3">{t('mysteryScoring:age')}</th>
                {SCORING_FIELDS.map((f) => (
                  <th key={f} className="px-1.5 py-2 align-bottom">
                    {fieldLabel(f)}
                    {NEGATIVE.has(f) && (
                      <span className="block font-normal text-slate-400">{t('mysteryScoring:negativeHint')}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AUDIENCE_BANDS.map((b) => (
                <tr key={b.value} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-slate-700">{getBandLabel(b.value, t)}</td>
                  {SCORING_FIELDS.map((f) => (
                    <td key={f} className="px-1.5 py-1.5">
                      <NumberCell
                        field={f}
                        value={draft.by_age[b.value]?.[f] ?? ''}
                        placeholder={t('mysteryScoring:placeholderScenario')}
                        ariaLabel={`${getBandLabel(b.value, t)} - ${fieldLabel(f)}`}
                        onChange={(v) => setAge(b.value, f, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* By scenario */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{t('mysteryScoring:byScenarioTitle')}</h2>
          {scenarios.length > 6 && (
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('mysteryScoring:search')}
                className="w-56 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">{t('mysteryScoring:byScenarioHint')}</p>

        {scenarios.length === 0 ? (
          <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-500">{t('mysteryScoring:noScenarios')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="py-2 pr-3">{t('mysteryScoring:scenario')}</th>
                  {SCORING_FIELDS.map((f) => (
                    <th key={f} className="px-1.5 py-2 align-bottom">{fieldLabel(f)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const ageSet = s.age_band ? draft.by_age[s.age_band] : undefined;
                  return (
                    <tr key={s.uniqid} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-800">{s.title}</div>
                        <div className="text-xs text-slate-400">
                          {s.age_band
                            ? t('mysteryScoring:ageApplied', { band: getBandLabel(s.age_band, t) })
                            : t('mysteryScoring:noAge')}
                        </div>
                      </td>
                      {SCORING_FIELDS.map((f) => {
                        // Placeholder = what applies when this cell stays blank.
                        const inherited = (ageSet?.[f] ?? '').trim();
                        return (
                          <td key={f} className="px-1.5 py-1.5">
                            <NumberCell
                              field={f}
                              value={draft.by_scenario[s.uniqid]?.[f] ?? ''}
                              placeholder={inherited !== '' && inherited !== '-' ? inherited : t('mysteryScoring:placeholderScenario')}
                              ariaLabel={`${s.title} - ${fieldLabel(f)}`}
                              onChange={(v) => setScenario(s.uniqid, f, v)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/90 py-3 backdrop-blur">
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> {t('mysteryScoring:saved')}
          </span>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('mysteryScoring:save')}
        </button>
      </div>
    </div>
  );
}
