/**
 * Product-scenario catalog grid - the in-app reproduction of the "Scenarios TH"
 * sheet. Sections by game type (QUEST = tagquest, MYSTERY, TRACK, CLASH), each
 * split into Children / Teens-Adults row groups, with the six age-band columns,
 * a difficulty-stars column and a univers-tags column.
 *
 * Lightly interactive: click a row to open the scenario editor, narrow with the
 * band / difficulty / univers filters, and use the browser Print button for a
 * hard copy (no PDF generator).
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Film, FileSpreadsheet } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import {
  AUDIENCE_BANDS,
  type AudienceBand,
  type CatalogGroup,
  resolveBands,
  bandsToCatalogGroup,
  getBandLabel,
} from '../types/audience';
import { DIFFICULTY_LEVELS, coerceDifficulty, formatDifficultyStars } from '../types/difficulty';
import { normalizeUnivers } from '../types/univers';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface CatalogScenario {
  id: number;
  uniqid: string | null;
  title: string;
  game_type: string;
  scenario_type: string | null;
  client_id: number | null;
  data: string | null;
  game_data?: string | null;
  bands: AudienceBand[];
  difficulty: number;
  univers: string[];
  group: CatalogGroup;
  // Tag Hunter GO / Drop adaptability. Two independent flags on game_meta -
  // a scenario can be both, either, or neither.
  adaptableGo: boolean;
  adaptableDrop: boolean;
}

// The two companion apps a scenario can be adapted to, as filter chips.
type AppFlag = 'go' | 'drop';
const APP_FLAGS: { value: AppFlag; label: string; on: string; off: string }[] = [
  { value: 'go', label: 'GO', on: 'bg-emerald-600 text-white border-emerald-600', off: 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300' },
  { value: 'drop', label: 'DROP', on: 'bg-sky-600 text-white border-sky-600', off: 'bg-white text-sky-700 border-sky-200 hover:border-sky-300' },
];

// Catalog section order + display labels. QUEST is the tagquest game type.
const SECTIONS: { gameType: string; label: string }[] = [
  { gameType: 'tagquest', label: 'QUEST' },
  { gameType: 'mystery', label: 'MYSTERY' },
  { gameType: 'tracks', label: 'TRACK' },
  { gameType: 'clash', label: 'CLASH' },
];

const GROUP_ORDER: CatalogGroup[] = ['enfants', 'ados_adultes'];
const GROUP_LABELS: Record<CatalogGroup, string> = { enfants: 'Children', ados_adultes: 'Teens/Adults' };

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return (obj?.game_meta ?? obj?.data?.game_meta ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ScenarioCatalogView() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<CatalogScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bandFilters, setBandFilters] = useState<Set<AudienceBand>>(new Set());
  const [difficultyFilters, setDifficultyFilters] = useState<Set<number>>(new Set());
  const [universFilters, setUniversFilters] = useState<Set<string>>(new Set());
  const [appFilters, setAppFilters] = useState<Set<AppFlag>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API_BASE_URL}/scenarios.php?action=list`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch scenarios');
        const json = await res.json();
        const rows: CatalogScenario[] = (json.scenarios || [])
          // Product catalog only.
          .filter((s: CatalogScenario) => s.scenario_type === 'product' || s.client_id === null)
          .map((s: CatalogScenario) => {
            const meta = parseMeta(s.data ?? s.game_data);
            const bands = resolveBands(meta.audience_bands, meta.game_public);
            return {
              ...s,
              bands,
              difficulty: coerceDifficulty(meta.difficulty),
              univers: normalizeUnivers(meta.univers),
              group: bandsToCatalogGroup(bands),
              adaptableGo: meta.adaptable_go === true,
              adaptableDrop: meta.adaptable_drop === true,
            };
          });
        if (!cancelled) setScenarios(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load catalog');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const universPool = useMemo(() => {
    const pool = new Set<string>();
    for (const s of scenarios) for (const tag of s.univers) pool.add(tag);
    return Array.from(pool).sort((a, b) => a.localeCompare(b));
  }, [scenarios]);

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, item: T) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const matches = (s: CatalogScenario): boolean => {
    if (bandFilters.size > 0 && !s.bands.some((b) => bandFilters.has(b))) return false;
    if (difficultyFilters.size > 0 && !difficultyFilters.has(s.difficulty)) return false;
    if (universFilters.size > 0) {
      const tags = s.univers.map((t) => t.toLowerCase());
      if (!tags.some((t) => universFilters.has(t))) return false;
    }
    // OR within the app chips: GO+DROP selected means "adapted to either".
    if (appFilters.size > 0) {
      const apps: AppFlag[] = [];
      if (s.adaptableGo) apps.push('go');
      if (s.adaptableDrop) apps.push('drop');
      if (!apps.some((a) => appFilters.has(a))) return false;
    }
    return true;
  };

  const filtered = useMemo(() => scenarios.filter(matches), [scenarios, bandFilters, difficultyFilters, universFilters, appFilters]);

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => {
        const rows = filtered.filter((s) => s.game_type === section.gameType);
        const groups = GROUP_ORDER.map((group) => ({
          group,
          rows: rows
            .filter((s) => s.group === group)
            .sort((a, b) => a.title.localeCompare(b.title)),
        })).filter((g) => g.rows.length > 0);
        return { ...section, groups, count: rows.length };
      }).filter((s) => s.count > 0),
    [filtered],
  );

  const exportXlsx = async () => {
    // Build a single sheet mirroring the on-screen catalog: game-type section
    // banners, Children/Teens-Adults group headers, then one row per scenario
    // with the six age-band columns, difficulty (numeric) and univers tags.
    const XLSX = await import('xlsx');
    const header = ['Scenario', ...AUDIENCE_BANDS.map((b) => getBandLabel(b.value)), 'Difficulty', 'Apps', 'Univers'];
    const cols = header.length;
    const aoa: (string | number)[][] = [header];
    for (const section of sections) {
      aoa.push([section.label, ...Array(cols - 1).fill('')]);
      for (const g of section.groups) {
        aoa.push([GROUP_LABELS[g.group], ...Array(cols - 1).fill('')]);
        for (const s of g.rows) {
          const bandSet = new Set(s.bands);
          aoa.push([
            s.title,
            ...AUDIENCE_BANDS.map((b) => (bandSet.has(b.value) ? '●' : '')),
            s.difficulty,
            [s.adaptableGo ? 'GO' : '', s.adaptableDrop ? 'DROP' : ''].filter(Boolean).join(' + '),
            s.univers.join(', '),
          ]);
        }
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 40 }, ...AUDIENCE_BANDS.map(() => ({ wch: 6 })), { wch: 10 }, { wch: 12 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <p className="text-slate-600">{filtered.length} product scenarios</p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportXlsx}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export as XLS
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap print:hidden">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Age</span>
        {AUDIENCE_BANDS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => toggle(setBandFilters, b.value)}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              bandFilters.has(b.value)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {getBandLabel(b.value)}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Difficulty</span>
        {DIFFICULTY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => toggle<number>(setDifficultyFilters, level)}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              difficultyFilters.has(level)
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {'★'.repeat(level)}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Apps</span>
        {APP_FLAGS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => toggle(setAppFilters, f.value)}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              appFilters.has(f.value) ? f.on : f.off
            }`}
          >
            {f.label}
          </button>
        ))}
        {universPool.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Univers</span>
            {universPool.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(setUniversFilters, tag.toLowerCase())}
                className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                  universFilters.has(tag.toLowerCase())
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Film className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No product scenarios match these filters</h3>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.gameType} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-red-600 text-white px-4 py-2 font-bold tracking-wide">{section.label}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">Scenario</th>
                      {AUDIENCE_BANDS.map((b) => (
                        <th key={b.value} className="px-2 py-2 text-xs font-semibold text-center w-16">
                          {getBandLabel(b.value)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-center">Difficulty</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-center">Apps</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">Univers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.groups.map((g) => (
                      <Fragment key={`${section.gameType}-${g.group}`}>
                        <tr className="bg-slate-100/70">
                          <td colSpan={AUDIENCE_BANDS.length + 4} className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {GROUP_LABELS[g.group]}
                          </td>
                        </tr>
                        {g.rows.map((s) => {
                          const bandSet = new Set(s.bands);
                          return (
                            <tr
                              key={s.id}
                              onClick={() => s.uniqid && navigate(`/studio/scenarios/${s.uniqid}`)}
                              className={`border-b border-slate-100 ${s.uniqid ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                            >
                              <td className="px-3 py-2 font-medium text-slate-900">{s.title}</td>
                              {AUDIENCE_BANDS.map((b) => (
                                <td key={b.value} className="px-2 py-2 text-center">
                                  {bandSet.has(b.value) ? (
                                    // A colored glyph (foreground color) prints reliably;
                                    // a bg-filled span disappears when the browser drops
                                    // background graphics on print.
                                    <span className="text-indigo-600 text-base leading-none print:text-lg">●</span>
                                  ) : (
                                    <span className="text-slate-200">·</span>
                                  )}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-center text-amber-500 whitespace-nowrap" title={`${s.difficulty} / 5`}>
                                {formatDifficultyStars(s.difficulty)}
                              </td>
                              {/* Foreground-colored text, not filled badges, so the
                                  column survives printing (same reason as the band dots). */}
                              <td className="px-3 py-2 text-center whitespace-nowrap text-xs font-bold">
                                {!s.adaptableGo && !s.adaptableDrop ? (
                                  <span className="text-slate-200">·</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    {s.adaptableGo && <span className="text-emerald-600">GO</span>}
                                    {s.adaptableDrop && <span className="text-sky-600">DROP</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {s.univers.map((tag) => (
                                    <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
