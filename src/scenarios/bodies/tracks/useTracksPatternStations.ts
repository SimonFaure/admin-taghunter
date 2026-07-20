/**
 * Resolves the scenario's selected tracks pattern (by uniqid) into an ordered
 * list of stations - one entry per checkpoint, in checkpoint order. Index 0 is
 * the first checkpoint.
 *
 * Mirrors PatternCorrespondence's semantics: pattern_items is the source of
 * truth (assignment_type 'station'), rows are taken in ascending item_index
 * order and mapped POSITIONALLY onto checkpoints (row N -> checkpoint N), so the
 * actual item_index values don't need to be 1-based or contiguous.
 */

import { useEffect, useState } from 'react';
import { db } from '../../../creator-ported/lib/db';

export interface CheckpointStation {
  stationId: number | null;
  stationName: string | null;
}

export function useTracksPatternStations(
  patternUniqid: string | null | undefined,
): CheckpointStation[] {
  const [stations, setStations] = useState<CheckpointStation[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!patternUniqid) {
      setStations([]);
      return;
    }
    (async () => {
      // uniqid -> numeric pattern id (pattern_items is keyed on the numeric id).
      const patRes = await db
        .from('patterns')
        .select('id')
        .eq('pattern_uniqid', patternUniqid)
        .eq('game_type', 'tracks')
        .maybeSingle();
      const patternId = (patRes.data as { id?: number } | null)?.id;
      if (cancelled) return;
      if (patternId == null) {
        setStations([]);
        return;
      }

      const [itemsRes, balisesRes] = await Promise.all([
        db
          .from('pattern_items')
          .select('item_index, assignment_type, station_key_number')
          .eq('pattern_id', patternId)
          .order('item_index', { ascending: true }),
        db.from('si_balises').select('id, station_name'),
      ]);
      if (cancelled) return;

      const nameById = new Map<number, string>();
      (Array.isArray(balisesRes.data) ? balisesRes.data : []).forEach((b: any) => {
        nameById.set(Number(b.id), b.station_name);
      });

      // tracks shape: a single 'station' slot per pattern row (item_index).
      const byIndex = new Map<number, number | null>();
      (Array.isArray(itemsRes.data) ? itemsRes.data : []).forEach((it: any) => {
        if (it.assignment_type !== 'station') return;
        const idx = Number(it.item_index);
        if (!Number.isFinite(idx)) return;
        const raw = it.station_key_number;
        const sid = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        byIndex.set(idx, Number.isFinite(sid as number) ? (sid as number) : null);
      });

      // Positional mapping: sort by item_index, emit in that order.
      const ordered = Array.from(byIndex.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, sid]) => sid);

      setStations(
        ordered.map((sid) => ({
          stationId: sid,
          stationName: sid != null ? nameById.get(sid) ?? null : null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [patternUniqid]);

  return stations;
}
