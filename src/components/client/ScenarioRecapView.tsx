/**
 * Scenario recap - the "little book" page of the old Laravel app
 * (`/jeux/scenario/<type>/<id>`), rebuilt. Licensees used it to read which
 * balise produced which image; it had no equivalent in Studio and was missed
 * (retour Ludiom #40).
 *
 * Content is deliberately narrow: the scenario's items (enigmas / quests /
 * checkpoints) with their images, their points, and - for every image a pattern
 * maps - the station number and name the chosen pattern assigns to it. A pattern
 * selector at the top switches the whole table, exactly like the old page's
 * "Choisir un modèle".
 *
 * Rendered in two places:
 *   - inside `ScenarioDetailView`, as a section on the scenario page
 *   - standalone at `/recap/:uniqid` (`printable`), laid out for paper - the
 *     licensee prints it or saves it as PDF from the browser
 *
 * Data: `scenario_files.php?action=recap` (items + which pattern slot each image
 * is read from) joined here against `patterns.php?action=list` + `?action=stations`.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, Printer } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

interface RecapImage {
  label: string;
  /** `pattern_items.assignment_type` this image is read from; null = never mapped. */
  pattern_slot: string | null;
  url: string;
}

interface RecapItem {
  /** The pattern row this item is matched against (enigma number / 1-based position). */
  pattern_index: number;
  number: string;
  title: string;
  description: string;
  points: { good?: string; wrong?: string; points?: string };
  images: RecapImage[];
}

interface RecapData {
  uniqid: string;
  title: string;
  description: string | null;
  game_type: string;
  scenario_type: string;
  version: string;
  language: string;
  background_image: string | null;
  default_pattern_uniqid: string | null;
  items: RecapItem[];
}

interface RecapPattern {
  id: number;
  name: string;
  game_type: string;
  pattern_uniqid?: string;
  pattern_data: string;
  is_default: boolean;
}

interface Station {
  id: number;
  station_name: string;
}

/** One pattern row: which station each slot is assigned to. */
interface PatternRow {
  index: number;
  assignments: Record<string, number | null>;
}

function coerceStationId(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * `pattern_data` reaches us in one of two shapes (patterns.php synthesizes the
 * canonical one from `pattern_items` when the column is empty):
 *   canonical: [{ index, assignments: { slot: stationId|null } }]
 *   legacy:    [{ item_index, assignment_type, station_key_number }]
 * Same normalisation as PatternCorrespondence.
 */
function normalizePatternRows(raw: string | null | undefined): PatternRow[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { pattern_data?: unknown[] })?.pattern_data)
      ? (parsed as { pattern_data: unknown[] }).pattern_data
      : [];
  if (arr.length === 0) return [];

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object';

  if (arr.every((it) => isRecord(it) && 'assignments' in it)) {
    return (arr as Array<Record<string, unknown>>)
      .map((it, i) => {
        const rawAssign = isRecord(it.assignments) ? it.assignments : {};
        const assignments: Record<string, number | null> = {};
        Object.keys(rawAssign).forEach((k) => {
          assignments[k] = coerceStationId(rawAssign[k]);
        });
        return { index: typeof it.index === 'number' ? it.index : i + 1, assignments };
      })
      .sort((a, b) => a.index - b.index);
  }

  if (arr.every((it) => isRecord(it) && 'assignment_type' in it)) {
    const map = new Map<number, Record<string, number | null>>();
    (arr as Array<Record<string, unknown>>).forEach((it) => {
      const idx = Number(it.item_index) || 0;
      if (!map.has(idx)) map.set(idx, {});
      map.get(idx)![String(it.assignment_type)] = coerceStationId(it.station_key_number);
    });
    return Array.from(map.entries())
      .map(([index, assignments]) => ({ index, assignments }))
      .sort((a, b) => a.index - b.index);
  }

  return [];
}

function mediaUrl(path: string): string {
  return path.startsWith('http') ? path : `${MEDIA_BASE_URL}${path}`;
}

/** The game types that have a recap. Others get an explicit "not available" note. */
const SUPPORTED_TYPES = ['mystery', 'tagquest', 'tracks'];

export interface ScenarioRecapViewProps {
  uniqid: string;
  /** Standalone page laid out for paper (adds a title block + print button). */
  printable?: boolean;
}

export function ScenarioRecapView({ uniqid, printable = false }: ScenarioRecapViewProps) {
  const { t } = useTranslation('scenarioRecap');
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [patterns, setPatterns] = useState<RecapPattern[]>([]);
  const [stations, setStations] = useState<Record<number, Station>>({});
  const [patternId, setPatternId] = useState<number | 'none'>('none');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/scenario_files.php?action=recap&uniqid=${encodeURIComponent(uniqid)}`,
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body?.data) {
          setError(body?.error || t('failedToLoad'));
          return;
        }
        setRecap(body.data as RecapData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid, t]);

  // Patterns + stations. Non-fatal: without them the recap still lists the
  // images, just with no balise column.
  const gameType = recap?.game_type;
  useEffect(() => {
    if (!gameType || !SUPPORTED_TYPES.includes(gameType)) return;
    let cancelled = false;
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/patterns.php?action=list&game_type=${encodeURIComponent(gameType)}`),
          authFetch(`${API_BASE_URL}/patterns.php?action=stations`),
        ]);
        if (cancelled) return;
        const pBody = pRes.ok ? await pRes.json() : null;
        const sBody = sRes.ok ? await sRes.json() : null;
        if (cancelled) return;
        const list = (Array.isArray(pBody?.data) ? pBody.data : []) as RecapPattern[];
        setPatterns(list);
        const byId: Record<number, Station> = {};
        (Array.isArray(sBody?.data) ? sBody.data : []).forEach((s: Station) => {
          byId[Number(s.id)] = s;
        });
        setStations(byId);
      } catch {
        // Non-fatal - the recap renders without the balise column.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType]);

  // Preselect the scenario's own default pattern; fall back to the first one so
  // the balise column is populated without the licensee having to choose.
  useEffect(() => {
    if (patterns.length === 0) return;
    const preferred =
      (recap?.default_pattern_uniqid
        ? patterns.find((p) => p.pattern_uniqid === recap.default_pattern_uniqid)
        : undefined) ?? patterns[0];
    setPatternId(preferred ? preferred.id : 'none');
  }, [patterns, recap?.default_pattern_uniqid]);

  const rows = useMemo(() => {
    const p = patterns.find((x) => x.id === patternId);
    return p ? normalizePatternRows(p.pattern_data) : [];
  }, [patterns, patternId]);

  /**
   * The station a given item's slot maps to. Rows are keyed by their own index -
   * which for mystery IS the enigma number and for the other types is the 1-based
   * position - so an exact match is tried first, with a positional fallback for
   * patterns whose rows are numbered from 0 or with gaps.
   */
  function stationFor(item: RecapItem, slot: string | null): Station | null | undefined {
    if (!slot || rows.length === 0) return undefined;
    const row =
      rows.find((r) => r.index === item.pattern_index) ??
      rows[item.pattern_index - 1];
    if (!row) return undefined;
    const id = row.assignments[slot];
    if (id == null) return null;
    return stations[id] ?? ({ id, station_name: t('unknownStation') } as Station);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-red-600 text-sm">
        {error || t('failedToLoad')}
      </div>
    );
  }

  if (!SUPPORTED_TYPES.includes(recap.game_type)) {
    return <p className="text-sm text-slate-500">{t('notAvailableForType')}</p>;
  }

  const pointsLine = (item: RecapItem) => {
    if (item.points.points !== undefined && item.points.points !== '') {
      return t('pointsValue', { points: item.points.points });
    }
    const good = item.points.good ?? '';
    const wrong = item.points.wrong ?? '';
    if (good === '' && wrong === '') return null;
    return t('goodWrongPoints', { good: good || '0', wrong: wrong || '0' });
  };

  return (
    <div className={printable ? 'recap-print mx-auto max-w-4xl px-6 py-8 bg-white text-slate-900' : ''}>
      {/* Print stylesheet. Scoped to this component so it only applies where the
          recap is on screen; the browser's own "Print" is the export path. */}
      <style>{`
        @media print {
          .recap-no-print { display: none !important; }
          .recap-item { break-inside: avoid; page-break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>

      {printable && (
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold">{recap.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('subtitle', { version: recap.version })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="recap-no-print inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
          >
            <Printer className="w-4 h-4" />
            {t('print')}
          </button>
        </div>
      )}

      {/* Pattern selector - the balise column is only meaningful for one model
          at a time, exactly like the old page's "Choisir un modèle". */}
      <div className="recap-no-print mb-5 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600" htmlFor="recap-pattern">
          {t('choosePattern')}
        </label>
        <select
          id="recap-pattern"
          value={String(patternId)}
          onChange={(e) => setPatternId(e.target.value === 'none' ? 'none' : Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="none">{t('noPattern')}</option>
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.is_default ? ` ${t('defaultSuffix')}` : ''}
            </option>
          ))}
        </select>
        {patterns.length === 0 && <span className="text-xs text-slate-400">{t('noPatternsAvailable')}</span>}
      </div>

      {/* The selected pattern is printed too - a sheet whose balises came from an
          unnamed model is useless on site. */}
      {patternId !== 'none' && (
        <p className="mb-4 hidden text-sm text-slate-600 print:block">
          {t('patternPrinted', { name: patterns.find((p) => p.id === patternId)?.name ?? '' })}
        </p>
      )}

      {recap.items.length === 0 ? (
        <p className="text-sm text-slate-500">{t('noItems')}</p>
      ) : (
        <div className="space-y-4">
          {recap.items.map((item) => (
            <section
              key={`${item.pattern_index}-${item.number}`}
              className="recap-item rounded-xl border border-slate-200 bg-white p-4"
            >
              <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  {t(`itemHeading.${recap.game_type}`, { number: item.number })}
                </h2>
                {item.title && <span className="text-sm text-slate-700">{item.title}</span>}
                {pointsLine(item) && (
                  <span className="ml-auto text-xs text-slate-500">{pointsLine(item)}</span>
                )}
              </header>

              {item.description && (
                <p className="mb-3 text-xs leading-relaxed text-slate-600">{item.description}</p>
              )}

              {item.images.length === 0 ? (
                <p className="text-xs text-slate-400">{t('noImages')}</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {item.images.map((img) => {
                    const station = stationFor(item, img.pattern_slot);
                    return (
                      <figure key={`${img.label}-${img.url}`} className="w-40">
                        <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <img
                            src={mediaUrl(img.url)}
                            alt={t(`imageLabel.${img.label}`, { defaultValue: img.label })}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-600">
                          <span className="block font-medium text-slate-700">
                            {t(`imageLabel.${img.label}`, { defaultValue: img.label })}
                          </span>
                          {img.pattern_slot && (
                            <span className="mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                              {station === undefined ? (
                                <span className="text-slate-400">{t('noStation')}</span>
                              ) : station === null ? (
                                <span className="text-slate-400">{t('unassigned')}</span>
                              ) : (
                                <>
                                  <span className="font-mono text-slate-700">#{station.id}</span>
                                  <span className="truncate">{station.station_name}</span>
                                </>
                              )}
                            </span>
                          )}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
