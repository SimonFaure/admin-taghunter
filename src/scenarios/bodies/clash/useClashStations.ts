/**
 * The client's si_balises inventory, shared by the two clash surfaces that pick
 * a station: the territories picker (TerritoriesSection) and the purge-station
 * picker (ClashPurgeSection).
 *
 * Clash stores station NUMBERS (`Number(si_balises.station_name)`), not ids -
 * the playground resolves numbers → ids at launch through the
 * `station_ids_by_number` map shipped with the scenario data. Both pickers work
 * in that number space; the raw rows are returned here so each can decide what
 * to do with non-numeric names.
 *
 * Fetched lazily (first time `enabled` goes true, i.e. when a picker opens) and
 * kept for the rest of the editing session.
 */

import { useEffect, useState } from 'react';
import { db } from '../../../creator-ported/lib/db';

export interface StationRow {
  id: number;
  station_name: string;
  station_function: string | null;
}

export interface StationInventory {
  stations: StationRow[];
  loading: boolean;
  error: boolean;
  /** True once a fetch has succeeded - `stations` is only meaningful then. */
  loaded: boolean;
}

export function useStationInventory(enabled: boolean): StationInventory {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    setLoading(true);
    setError(false); // a previous failure retries when a picker reopens
    (async () => {
      try {
        const { data, error: err } = await db
          .from('si_balises')
          .select('id, station_name, station_function')
          .order('id', { ascending: true });
        if (err) throw err;
        if (cancelled) return;
        setStations(
          (Array.isArray(data) ? data : []).map((s: Record<string, unknown>) => ({
            id: Number(s.id),
            station_name: String(s.station_name ?? ''),
            station_function: (s.station_function as string | null) || null,
          })),
        );
        setLoaded(true);
      } catch (e) {
        console.error('Error loading stations:', e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  return { stations, loading, error, loaded };
}
