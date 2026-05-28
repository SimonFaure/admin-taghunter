/**
 * Save / publish / ZIP-download orchestrator. Generic across game types —
 * type-specific shape comes from `adapter.{cleanGameMetaForData, buildMediasColumn,
 * enumerateMedia, buildZipGameData}`.
 *
 * Lifted from MysteryConfig / TagquestConfig save paths during Slice 2B with
 * one deliberate change: the new flows write the SAME canonical shape for
 * regular save, ZIP-download, and publish — collapsing the duplicate-top-level
 * `quests` drift that Stage 1's strict-wrapper schema flagged in Tagquest.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import JSZip from 'jszip';
import { db } from '../../../creator-ported/lib/db';
import { getMediaUrl } from '../../../creator-ported/utils/mediaUrl';
import type { ScenarioAdapter } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SavePayload<TGameMeta = any> {
  scenarioId: string;
  uniqid: string;
  adapter: ScenarioAdapter<TGameMeta>;
  /**
   * Source-language title — derived by the shell from
   * `getLocalized(gameMeta.title, defaultLanguage, defaultLanguage)`. Written
   * to the row's `scenarios.title` column for list-view sort/search. The
   * authoritative title lives inside `gameMeta.title` as a `Localized<string>`.
   */
  title: string;
  /** Source-language description — same denormalization as `title`. */
  description: string;
  gameMeta: TGameMeta;
  defaultLanguage: string;
  availableLanguages: string[];
  scenarioType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scenarioLayout: any;
  /**
   * Row-level `scenarios.status` to write. Only set by the publish path
   * (`'published'`). When omitted, the existing status is left untouched so a
   * regular save never silently demotes/promotes a scenario.
   */
  status?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedScenario?: any;
}

export interface ZipDownloadOptions {
  onProgress?: (message: string) => void;
}

/**
 * Build the canonical scenarios.data + scenarios.medias payload from a
 * SavePayload + adapter helpers.
 */
function buildCanonicalUpdate<TGameMeta>(payload: SavePayload<TGameMeta>) {
  const cleanGameMeta = payload.adapter.cleanGameMetaForData(payload.gameMeta);
  const medias = payload.adapter.buildMediasColumn(payload.gameMeta, payload.uniqid);
  // Stage 3 (D5) shape: translatable content is per-field `Localized<T>`
  // INSIDE game_meta. The legacy `data.translations[lang] = {full copy}`
  // envelope is no longer written. Row-level title/description are
  // denormalized from gameMeta.title/description by the caller (see
  // ScenarioEditorShell.buildPayload).
  return {
    title: payload.title,
    description: payload.description,
    data: {
      game_meta: cleanGameMeta,
      default_language: payload.defaultLanguage,
      available_languages: payload.availableLanguages,
    },
    medias,
    // Only written when the publish path supplies it; a plain save omits
    // `status` so the existing row value is preserved.
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
}

/**
 * Bump `scenarios.version` by +0.1 (the studio's semantic-versioning step),
 * mutating the given update object in place (reads the current value first).
 * Playgrounds re-download a scenario when the sync manifest version differs from
 * the local one, so every content save MUST advance it — otherwise edits stay
 * invisible to already-synced playgrounds. The playground compares versions as
 * floats, so a 0.1 step is enough. Shared by the editor save and layout save.
 */
export async function bumpScenarioVersion(
  scenarioId: number | string,
  update: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await db
      .from('scenarios')
      .select('version')
      .eq('id', scenarioId)
      .single();
    const cur = Number((data as { version?: unknown } | null)?.version) || 0;
    update.version = String(Number((cur + 0.1).toFixed(1)));
  } catch {
    // Leave version untouched if the read fails — better than writing a bad value.
  }
}

/**
 * Regular save — canonical shape, same DB write for save/publish/zip-prelude.
 * Lifted from TagquestConfig.tsx:706 / MysteryConfig.tsx:619 (the careful
 * cleanup version, not the raw-config publish path).
 */
export async function performSave<TGameMeta>(payload: SavePayload<TGameMeta>): Promise<SaveResult> {
  try {
    const update = buildCanonicalUpdate(payload);
    // Bump the row version (+0.1) so already-synced playgrounds re-download the
    // edited scenario. Read-then-increment.
    await bumpScenarioVersion(payload.scenarioId, update);
    const { data, error } = await db
      .from('scenarios')
      .update(update)
      .eq('id', payload.scenarioId)
      .select()
      .single();
    if (error) {
      return { ok: false, error: error.message ?? 'Save failed' };
    }
    return { ok: true, savedScenario: data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

/**
 * ZIP download — saves first (canonical), then downloads every enumerated
 * media file, builds game-data.json via adapter, packages, triggers download.
 *
 * Lifted from TagquestConfig.tsx:1290 / MysteryConfig.tsx:958 with the
 * cleanup that the new shell writes only the canonical data shape.
 */
export async function performZipDownload<TGameMeta>(
  payload: SavePayload<TGameMeta>,
  options: ZipDownloadOptions = {},
): Promise<SaveResult> {
  const progress = options.onProgress ?? (() => {});
  try {
    progress('Saving configuration...');
    const saveResult = await performSave(payload);
    if (!saveResult.ok) return saveResult;

    progress('Creating ZIP archive...');
    const zip = new JSZip();
    const mediaFolder = zip.folder('media');
    if (!mediaFolder) {
      return { ok: false, error: 'Failed to create media folder in ZIP' };
    }

    const enumerated = payload.adapter.enumerateMedia(payload.gameMeta);
    const uniqueFilenames = Array.from(new Set(enumerated.map((m) => m.filename))).filter(Boolean);

    progress(`Downloading ${uniqueFilenames.length} media files...`);
    for (const filename of uniqueFilenames) {
      try {
        const url = getMediaUrl(payload.uniqid || payload.scenarioId, filename);
        const response = await fetch(url);
        if (response.ok) {
          mediaFolder.file(filename, await response.blob());
        }
      } catch (err) {
        console.warn(`[performZipDownload] failed to fetch ${filename}`, err);
      }
    }

    progress('Packaging scenario data...');
    const relativeUrl = (filename: string) => (filename ? `media/${filename.split('/').pop()}` : '');
    const zipScenarioData = payload.adapter.buildZipPayload(
      {
        scenarioId: payload.scenarioId,
        uniqid: payload.uniqid,
        title: payload.title,
        description: payload.description,
        gameMeta: payload.gameMeta,
        defaultLanguage: payload.defaultLanguage,
        availableLanguages: payload.availableLanguages,
        scenarioType: payload.scenarioType,
        scenarioLayout: payload.scenarioLayout,
      },
      relativeUrl,
    );
    zip.file('game-data.json', JSON.stringify(zipScenarioData, null, 2));

    progress('Generating ZIP file...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.adapter.zipFilenamePrefix}-${payload.uniqid || 'scenario'}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ZIP download failed' };
  }
}

