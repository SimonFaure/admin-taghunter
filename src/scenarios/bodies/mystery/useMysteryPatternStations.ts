/**
 * Resolves the scenario's selected mystery pattern (by uniqid) into per-enigma
 * station correspondences. The result is keyed by `item_index` - the value the
 * playground matches against each enigma's `number` at runtime - and each entry
 * maps the slot keys ('good_answer_station' | 'wrong_answer_station') to the
 * assigned station.
 *
 * Mirrors useTagquestPatternStations, but mystery has one row per enigma (two
 * answer-image slots) instead of one row per quest (four piece slots), and is
 * keyed by item_index rather than positionally because mystery scoring matches
 * by enigma number, not order.
 */

import { useEffect, useState } from 'react';
import { db } from '../../../creator-ported/lib/db';

export interface SlotStation {
  stationId: number | null;
  stationName: string | null;
}

export type EnigmaStations = Record<string, SlotStation>;

export function useMysteryPatternStations(
  patternUniqid: string | null | undefined,
): Record<number, EnigmaStations> {
  const [byIndex, setByIndex] = useState<Record<number, EnigmaStations>>({});

  useEffect(() => {
    let cancelled = false;
    if (!patternUniqid) {
      setByIndex({});
      return;
    }
    (async () => {
      const patRes = await db
        .from('patterns')
        .select('id')
        .eq('pattern_uniqid', patternUniqid)
        .eq('game_type', 'mystery')
        .maybeSingle();
      const patternId = (patRes.data as { id?: number } | null)?.id;
      if (cancelled) return;
      if (patternId == null) {
        setByIndex({});
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

      // Group flat pattern_items into one record per item_index, keyed by slot.
      const out: Record<number, EnigmaStations> = {};
      (Array.isArray(itemsRes.data) ? itemsRes.data : []).forEach((it: any) => {
        const idx = Number(it.item_index);
        if (!Number.isFinite(idx)) return;
        const slot = String(it.assignment_type ?? '');
        if (!slot) return;
        const raw = it.station_key_number;
        const sid = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        const stationId = Number.isFinite(sid as number) ? (sid as number) : null;
        if (!out[idx]) out[idx] = {};
        out[idx][slot] = {
          stationId,
          stationName: stationId != null ? nameById.get(stationId) ?? null : null,
        };
      });

      setByIndex(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [patternUniqid]);

  return byIndex;
}
