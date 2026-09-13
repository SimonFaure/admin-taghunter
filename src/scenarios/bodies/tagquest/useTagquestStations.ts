/**
 * Station lookups shared by the tagquest editor's two station-selecting
 * surfaces - the pattern picker (PatternSection) and the malus-station picker
 * (MalusComboSection). Both work in `si_balises.id` space, the same space as
 * `pattern_items.station_key_number` and the SI punch `code`.
 *
 * The invariant these back: a scenario's malus station must never also be one
 * of its pattern's quest stations. A punch there would have to both complete a
 * quest slot and cost malus points, which the playground cannot express (it
 * consumes each physical punch exactly once).
 */

import { useEffect, useState } from 'react';
import { db } from '../../../creator-ported/lib/db';

export interface StationRow {
  id: number;
  station_name: string;
  station_function: string | null;
}

/** The client's full si_balises inventory, ordered by id. Fetched once. */
export function useStationInventory(enabled: boolean): {
  stations: StationRow[];
  loading: boolean;
  error: boolean;
} {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await db
          .from('si_balises')
          .select('id, station_name, station_function')
          .order('id', { ascending: true });
        if (cancelled) return;
        setStations(
          (Array.isArray(data) ? data : []).map((s: Record<string, unknown>) => ({
            id: Number(s.id),
            station_name: String(s.station_name ?? ''),
            station_function: (s.station_function as string | null) || null,
          })),
        );
        setLoaded(true);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  return { stations, loading, error };
}

/**
 * Station ids used by EVERY tagquest pattern, keyed by pattern uniqid. Two
 * queries (patterns, then their items) - enough to tell, before a pattern is
 * applied, whether it would collide with the scenario's malus station.
 */
export function useTagquestPatternStationIds(): Map<string, Set<number>> {
  const [byPattern, setByPattern] = useState<Map<string, Set<number>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: patRows } = await db
          .from('patterns')
          .select('id, pattern_uniqid')
          .eq('game_type', 'tagquest');
        if (cancelled) return;
        const rows = (Array.isArray(patRows) ? patRows : []) as Array<{
          id: number | string;
          pattern_uniqid: string | null;
        }>;
        const uniqidById = new Map<number, string>();
        for (const r of rows) {
          if (r.pattern_uniqid) uniqidById.set(Number(r.id), r.pattern_uniqid);
        }
        if (uniqidById.size === 0) {
          setByPattern(new Map());
          return;
        }

        const { data: itemRows } = await db
          .from('pattern_items')
          .select('pattern_id, station_key_number')
          .in('pattern_id', [...uniqidById.keys()]);
        if (cancelled) return;

        const out = new Map<string, Set<number>>();
        for (const uid of uniqidById.values()) out.set(uid, new Set<number>());
        (Array.isArray(itemRows) ? itemRows : []).forEach((it: Record<string, unknown>) => {
          const uid = uniqidById.get(Number(it.pattern_id));
          if (!uid) return;
          const raw = it.station_key_number;
          if (raw === null || raw === undefined || raw === '') return;
          const sid = Number(raw);
          if (Number.isFinite(sid)) out.get(uid)!.add(sid);
        });
        setByPattern(out);
      } catch {
        if (!cancelled) setByPattern(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return byPattern;
}
