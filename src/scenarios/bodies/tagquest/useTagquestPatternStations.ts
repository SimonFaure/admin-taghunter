/**
 * Resolves the scenario's selected tagquest pattern (by uniqid) into per-quest,
 * per-image-slot station correspondences. Index i is the i-th quest; each entry
 * maps slot keys ('image_1'..'image_4') to the assigned station.
 *
 * Mirrors PatternCorrespondence's semantics: pattern_items is the source of
 * truth (assignment_type is the slot key), rows are taken in ascending
 * item_index order and mapped POSITIONALLY onto quests.
 */

import { useEffect, useState } from 'react';
import { db } from '../../../creator-ported/lib/db';

export interface SlotStation {
  stationId: number | null;
  stationName: string | null;
}

export type QuestStations = Record<string, SlotStation>;

export function useTagquestPatternStations(
  patternUniqid: string | null | undefined,
): QuestStations[] {
  const [rows, setRows] = useState<QuestStations[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!patternUniqid) {
      setRows([]);
      return;
    }
    (async () => {
      const patRes = await db
        .from('patterns')
        .select('id')
        .eq('pattern_uniqid', patternUniqid)
        .eq('game_type', 'tagquest')
        .maybeSingle();
      const patternId = (patRes.data as { id?: number } | null)?.id;
      if (cancelled) return;
      if (patternId == null) {
        setRows([]);
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
      const byIndex = new Map<number, QuestStations>();
      (Array.isArray(itemsRes.data) ? itemsRes.data : []).forEach((it: any) => {
        const idx = Number(it.item_index);
        if (!Number.isFinite(idx)) return;
        const slot = String(it.assignment_type ?? '');
        if (!slot) return;
        const raw = it.station_key_number;
        const sid = raw === null || raw === undefined || raw === '' ? null : Number(raw);
        const stationId = Number.isFinite(sid as number) ? (sid as number) : null;
        if (!byIndex.has(idx)) byIndex.set(idx, {});
        byIndex.get(idx)![slot] = {
          stationId,
          stationName: stationId != null ? nameById.get(stationId) ?? null : null,
        };
      });

      // Positional mapping: sort by item_index, emit in that order.
      setRows(
        Array.from(byIndex.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, slots]) => slots),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [patternUniqid]);

  return rows;
}
