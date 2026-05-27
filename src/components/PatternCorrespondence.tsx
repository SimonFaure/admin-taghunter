import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { db } from '../creator-ported/lib/db';

interface Station {
  id: number;
  station_name: string;
  station_function?: string | null;
}

// Per game type: which assignment slots a pattern row carries, and how each
// slot column is labelled. Mirrors PATTERN_SHAPES in PatternEditor.tsx.
const PATTERN_SHAPES: Record<string, { types: string[]; labels: string[] }> = {
  mystery:  { types: ['good_answer_station', 'wrong_answer_station'], labels: ['Good answer', 'Wrong answer'] },
  survival: { types: ['good_answer_station', 'wrong_answer_station'], labels: ['Good answer', 'Wrong answer'] },
  tagquest: { types: ['image_1', 'image_2', 'image_3', 'image_4'],    labels: ['Image 1', 'Image 2', 'Image 3', 'Image 4'] },
  tracks:   { types: ['station'],                                      labels: ['Station'] },
};

// What one pattern row represents, per game type.
const ROW_NOUN: Record<string, string> = {
  tagquest: 'Quest',
  mystery: 'Enigma',
  survival: 'Enigma',
  tracks: 'Checkpoint',
};

interface NormalizedRow {
  index: number;
  assignments: Record<string, number | null>;
}

interface PatternItem {
  item_index: number;
  assignment_type: string;
  station_key_number: number | string | null;
}

function coerceStationId(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function prettify(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Group flat pattern_items rows ({ item_index, assignment_type,
// station_key_number }) into one row per item_index. This is the canonical
// source the editor reads from.
function rowsFromItems(items: PatternItem[]): NormalizedRow[] {
  const map = new Map<number, Record<string, number | null>>();
  items.forEach((it) => {
    const idx = typeof it.item_index === 'number' ? it.item_index : Number(it.item_index) || 0;
    if (!map.has(idx)) map.set(idx, {});
    map.get(idx)![it.assignment_type] = coerceStationId(it.station_key_number);
  });
  return Array.from(map.entries())
    .map(([index, assignments]) => ({ index, assignments }))
    .sort((a, b) => a.index - b.index);
}

// Legacy fallback: pattern_data is stored as JSON in one of two shapes:
//   canonical: [{ index, assignments: { slot: stationId|null } }]
//   legacy:    [{ item_index, assignment_type, station_key_number }]
function rowsFromLegacyJson(raw: string): NormalizedRow[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }

  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.pattern_data)
      ? (parsed as any).pattern_data
      : [];
  if (arr.length === 0) return [];

  if (arr.every((it) => it && typeof it === 'object' && 'assignments' in it)) {
    return arr
      .map((it, i) => {
        const rawAssign = it.assignments && typeof it.assignments === 'object' ? it.assignments : {};
        const assignments: Record<string, number | null> = {};
        Object.keys(rawAssign).forEach((k) => {
          assignments[k] = coerceStationId(rawAssign[k]);
        });
        return { index: typeof it.index === 'number' ? it.index : i + 1, assignments };
      })
      .sort((a, b) => a.index - b.index);
  }

  if (arr.every((it) => it && typeof it === 'object' && 'assignment_type' in it)) {
    return rowsFromItems(arr as PatternItem[]);
  }

  return [];
}

function StationCell({ stationId, station }: { stationId: number | null; station?: Station }) {
  if (stationId == null) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">
        #{stationId}
      </span>
      <span className="text-slate-700">{station ? station.station_name : 'Unknown station'}</span>
    </span>
  );
}

interface PatternCorrespondenceProps {
  patternId: number | string;
  gameType: string;
  /** Legacy fallback used only when no pattern_items rows exist. */
  patternData: string;
}

export function PatternCorrespondence({ patternId, gameType, patternData }: PatternCorrespondenceProps) {
  const [stations, setStations] = useState<Record<number, Station>>({});
  const [rows, setRows] = useState<NormalizedRow[] | null>(null); // null = loading

  const shape = PATTERN_SHAPES[gameType] ?? PATTERN_SHAPES.tagquest;
  const noun = ROW_NOUN[gameType] ?? 'Item';

  // Columns: the game type's known slots first, then any extra slots that turn
  // up in the data (so unexpected shapes still render rather than hide info).
  const columns = useMemo(() => {
    const cols = shape.types.map((t, i) => ({ key: t, label: shape.labels[i] }));
    const known = new Set(shape.types);
    (rows ?? []).forEach((r) =>
      Object.keys(r.assignments).forEach((k) => {
        if (!known.has(k)) {
          known.add(k);
          cols.push({ key: k, label: prettify(k) });
        }
      })
    );
    return cols;
  }, [rows, shape]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      // Stations lookup table (id -> name).
      const stationsRes = await db
        .from('si_balises')
        .select('id, station_name, station_function')
        .order('id', { ascending: true });
      if (!cancelled && Array.isArray(stationsRes.data)) {
        const map: Record<number, Station> = {};
        stationsRes.data.forEach((s: any) => {
          map[Number(s.id)] = { id: Number(s.id), station_name: s.station_name, station_function: s.station_function };
        });
        setStations(map);
      }

      // Assignments live in pattern_items (the editor's source of truth);
      // pattern_data JSON is only a legacy fallback for never-resaved patterns.
      const itemsRes = await db
        .from('pattern_items')
        .select('item_index, assignment_type, station_key_number')
        .eq('pattern_id', patternId)
        .order('item_index', { ascending: true });
      if (cancelled) return;

      const items = Array.isArray(itemsRes.data) ? (itemsRes.data as PatternItem[]) : [];
      setRows(items.length > 0 ? rowsFromItems(items) : rowsFromLegacyJson(patternData));
    })();
    return () => {
      cancelled = true;
    };
  }, [patternId, patternData]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-700">Station correspondences</h4>
        </div>
        {rows && rows.length > 0 && (
          <span className="text-xs text-slate-400">
            {rows.length} {noun.toLowerCase()}
            {rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {rows === null ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">Loading correspondences…</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-slate-500">No station assignments yet.</p>
          <p className="text-xs text-slate-400 mt-1">Open this pattern in the editor to map stations.</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-28">
                  {noun}
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={row.index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {noun} {i + 1}
                  </td>
                  {columns.map((col) => {
                    const stationId = row.assignments[col.key] ?? null;
                    return (
                      <td key={col.key} className="px-4 py-2.5 whitespace-nowrap">
                        <StationCell
                          stationId={stationId}
                          station={stationId != null ? stations[stationId] : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
