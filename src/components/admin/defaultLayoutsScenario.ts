/**
 * Real scenario the "Default layouts" page draws its HUD against.
 *
 * Positions are studio-wide, but judging them on a blank mock HUD meant placing
 * the malus icons and quest thumbnails without ever seeing their artwork. So the
 * page loads one real Quest scenario (read-only, nothing is saved back to it)
 * and renders with its template, background, icons and quests.
 */

import { useEffect, useState } from 'react';
import { db } from '../../creator-ported/lib/db';
import { getMediaUrl } from '../../creator-ported/utils/mediaUrl';
import { mergeMediasIntoGameMeta, type ParsedMedias } from '../../scenarios/shell/state/hydrateGameMeta';
import type { Lang } from '../../scenarios/i18n/types';

export interface PreviewScenarioOption {
  id: string;
  title: string;
}

export interface PreviewScenario {
  id: string;
  uniqid: string;
  gameMeta: Record<string, unknown>;
  defaultLanguage: Lang;
}

/** The scenario picked when the admin has not chosen one yet. */
const DEFAULT_SCENARIO_MATCH = 'safari des animaux';

/** Lowercase, accents stripped: "Safari des Animaux" and "safari des animaux" match. */
function normalizeTitle(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function pickDefaultScenarioId(options: PreviewScenarioOption[]): string | null {
  const hit = options.find((o) => normalizeTitle(o.title).includes(DEFAULT_SCENARIO_MATCH));
  return hit?.id ?? options[0]?.id ?? null;
}

function parseCol(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Every Quest scenario, sorted by title, for the picker. */
export function useQuestScenarioOptions(): { options: PreviewScenarioOption[]; loading: boolean } {
  const [options, setOptions] = useState<PreviewScenarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await db
          .from('scenarios')
          .select('id, title')
          .eq('game_type', 'tagquest')
          .order('title', { ascending: true });
        if (!active) return;
        const rows = (Array.isArray(data) ? data : []) as Array<{ id: unknown; title?: unknown }>;
        setOptions(
          rows
            .map((r) => ({ id: String(r.id), title: typeof r.title === 'string' ? r.title : `#${r.id}` }))
            .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
        );
      } catch (err) {
        console.warn('[DefaultLayouts] could not list Quest scenarios', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { options, loading };
}

/** Load one scenario as the editor sees it: game_meta with its media files laid back on. */
export function usePreviewScenario(id: string | null): { scenario: PreviewScenario | null; loading: boolean } {
  const [scenario, setScenario] = useState<PreviewScenario | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!id) {
      setScenario(null);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await db
          .from('scenarios')
          .select('uniqid, data, medias')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (!data) {
          setScenario(null);
          return;
        }
        const row = data as { uniqid?: string; data?: unknown; medias?: unknown };
        const parsed = parseCol(row.data) as { game_meta?: Record<string, unknown>; default_language?: string } | null;
        const gameMeta: Record<string, unknown> = { ...(parsed?.game_meta ?? {}) };
        // Quests are mutated in place by the merge; copy them so a reload of the
        // same row never sees an earlier pass's objects.
        if (Array.isArray(gameMeta.quests)) {
          gameMeta.quests = (gameMeta.quests as Array<Record<string, unknown>>).map((q) => ({ ...q }));
        }
        mergeMediasIntoGameMeta(gameMeta, parseCol(row.medias) as ParsedMedias | null);
        setScenario({
          id,
          uniqid: row.uniqid ?? '',
          gameMeta,
          defaultLanguage: (parsed?.default_language ?? 'fr') as Lang,
        });
      } catch (err) {
        console.warn('[DefaultLayouts] could not load scenario', id, err);
        if (active) setScenario(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);
  return { scenario, loading };
}

/** Media resolver for a loaded scenario (same URL scheme as the editor). */
export function previewMediaResolver(scenario: PreviewScenario | null): (filename: string) => string {
  if (!scenario) return () => '';
  const key = scenario.uniqid || scenario.id;
  return (filename: string) => getMediaUrl(key, filename);
}
