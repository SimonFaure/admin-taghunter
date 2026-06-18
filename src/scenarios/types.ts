/**
 * Stage 2 — public types for the scenario authoring shell + per-type adapters.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 *
 * Wire shape on `scenarios.data` and `scenarios.medias` is unchanged from Stage 1.
 * These types describe HOW the shell consumes a body's adapter — they do not
 * impose a new on-disk shape.
 */

import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { ValidationResult } from '../creator-ported/utils/publishValidation';

export type ScenarioGameType = 'mystery' | 'tagquest' | 'tracks' | 'clash';

/**
 * A single asset slot the editor knows about — image, sound, or font.
 * `key` matches a field name in `game_meta` (e.g. 'background_image').
 * The shell renders an upload widget per slot, driven by this manifest.
 */
export interface MediaSlot {
  key: string;
  kind: 'image' | 'sound' | 'font' | 'video';
  required: 'error' | 'warning' | false;
  scope: 'common' | 'type';
  label: string;
  acceptMime?: readonly string[];
}

/**
 * Capabilities flags tell the shell which optional sections to render
 * and which translatable arrays the body cares about.
 *
 * - `hasLevels`: render LevelsSection. True for mystery + tagquest, false for tracks.
 * - `hasOverscores`: render OverscoresSection. Mystery only.
 * - `hasPodium`: render PodiumSection (top_1/3/10). True for mystery/tagquest/tracks;
 *   false for clash (clan-based, no per-team podium).
 * - `supportsProductTemplate`: render the "use default images/texts" toggle that
 *   pulls from the Tagquest defaultConfig table. Tagquest only today.
 * - `hasTranslatableArrays`: which named arrays under `game_meta` carry
 *   translatable per-element fields. Used by `synthesizeLegacyTranslations`
 *   when emitting back-compat ZIPs.
 */
export interface Capabilities {
  hasLevels: boolean;
  hasOverscores: boolean;
  hasPodium: boolean;
  supportsProductTemplate: boolean;
  hasTranslatableArrays: readonly ('quests' | 'enigmas' | 'levels' | 'overscores' | 'checkpoints')[];
}

/**
 * One enumerated media file inside a scenario — used by performZipDownload
 * (download-and-bundle). `font` covers author-uploaded custom font files.
 */
export interface EnumeratedMedia {
  fieldName: string;
  filename: string;
  kind: 'image' | 'sound' | 'video' | 'font';
}

/**
 * Shape of the `scenarios.medias` JSON column. Type-specific arrays
 * (quests/enigmas/levels/overscores) are optional — only present for
 * types that carry per-element media.
 */
export interface MediasColumn {
  images: Record<string, string>;
  sounds: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extra: string]: any;
}

/**
 * Snapshot of editor state passed to `adapter.buildZipPayload`. Lets the
 * adapter compose the ZIP's `game-data.json` from row-level metadata
 * (uniqid, title, description, scenarioType, scenarioLayout) plus the live
 * gameMeta, without coupling to the orchestrator's internal payload shape.
 *
 * Stage 3 note: translatable fields inside `gameMeta` are `Localized<string>`
 * maps. Adapters that need a legacy `translations[lang] = {full copy}`
 * envelope for ZIP back-compat synthesize it via
 * `synthesizeLegacyTranslations(gameMeta, capabilities, availableLanguages,
 * defaultLanguage)`.
 */
export interface ZipPayloadContext<TGameMeta = unknown> {
  scenarioId: string;
  uniqid: string;
  /** Source-language title (already flattened from `Localized<string>`). */
  title: string;
  /** Source-language description. */
  description: string;
  gameMeta: TGameMeta;
  defaultLanguage: string;
  availableLanguages: string[];
  scenarioType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scenarioLayout: any;
}

/**
 * Per-body adapter. Each body file (e.g. bodies/tagquest/adapter.ts) exports
 * one of these AND a React component. The shell consumes both.
 */
export interface ScenarioAdapter<TGameMeta = unknown> {
  kind: ScenarioGameType;
  label: string;
  capabilities: Capabilities;
  mediaSlots: readonly MediaSlot[];
  defaultConfig: () => TGameMeta;
  validator: (
    gameMeta: TGameMeta,
    title: string,
    description: string,
  ) => ValidationResult;
  /**
   * The Zod schema for the FULL `scenarios.data` payload (wrapper +
   * type-specific game_meta). Re-exported from `src/types/scenario-data.ts`
   * so adapters don't fork the source-of-truth shape.
   */
  dataSchema: z.ZodTypeAny;
  Body: ComponentType;

  /**
   * Build the `scenarios.medias` column shape from a gameMeta. Type-specific
   * because mystery wraps enigma media inline, tagquest wraps quest media,
   * and the partition (images/sounds + per-array slots) varies.
   *
   * `uniqid` is threaded in so adapters can emit absolute on-disk paths for
   * single-string media entries (e.g. `medias.video = "/media/<uniqid>/..."`)
   * that need to round-trip with the legacy ScenarioDetailView reader.
   */
  buildMediasColumn: (gameMeta: TGameMeta, uniqid: string) => MediasColumn;

  /**
   * Strip media (image/sound) fields from gameMeta and simplify nested arrays
   * (e.g. drop quest images, keep just name+points). Returns the clean
   * `data.game_meta` content. Used by the regular-save path.
   */
  cleanGameMetaForData: (gameMeta: TGameMeta) => Record<string, unknown>;

  /**
   * Enumerate every media filename referenced anywhere in gameMeta —
   * top-level fields PLUS nested array slots (quest images, enigma images, etc).
   * Used by the publish flow (collect-and-upload) and the ZIP-download
   * path (download-and-bundle).
   */
  enumerateMedia: (gameMeta: TGameMeta) => readonly EnumeratedMedia[];

  /**
   * Build the FULL contents of `game-data.json` inside the ZIP. Mystery and
   * Tagquest produce meaningfully different shapes (translations location,
   * medias partition, scenario header keys), so the adapter owns the whole
   * envelope. The orchestrator just stringifies and writes it.
   *
   * Receives the full `SavePayload`-shaped context plus a `relativeUrl` helper
   * that converts a stored filename to its `media/<filename>` path inside the ZIP.
   */
  buildZipPayload: (
    ctx: ZipPayloadContext<TGameMeta>,
    relativeUrl: (filename: string) => string,
  ) => Record<string, unknown>;

  /**
   * Filename prefix for the downloaded ZIP, e.g. 'tagquest' →
   * `tagquest-<uniqid>.zip`.
   */
  zipFilenamePrefix: string;
}

/**
 * UI alert surfaced by the shell's save bar / publish modal.
 */
export interface ShellAlert {
  type: 'info' | 'success' | 'error';
  message: string;
}

/**
 * What `useScenarioEditor()` returns — the full state + actions surface
 * the shell exposes to bodies via React context.
 *
 * Bodies destructure what they need; everything is generic over TGameMeta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ScenarioEditorState<TGameMeta = any> {
  scenarioId: string;
  uniqid: string;
  gameType: ScenarioGameType;
  adapter: ScenarioAdapter<TGameMeta>;

  /**
   * The DB column `scenarios.version` (auto-bumped +0.1 on every save). Shown
   * read-only in the admin section so it matches the scenarios details page.
   */
  scenarioVersion: string;

  gameMeta: TGameMeta;
  setGameMeta: (updater: (m: TGameMeta) => TGameMeta) => void;
  setField: <K extends keyof TGameMeta>(key: K, value: TGameMeta[K]) => void;

  currentLanguage: string;
  defaultLanguage: string;
  availableLanguages: string[];
  switchLanguage: (lang: string) => void;
  addLanguage: (lang: string) => void;
  removeLanguage: (lang: string) => void;

  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  alert: ShellAlert | null;
  setAlert: (a: ShellAlert | null) => void;

  uploadAsset: (slotKey: string, file: File) => Promise<string>;
  getMediaUrl: (filename: string) => string;

  save: () => Promise<void>;
  publish: () => Promise<void>;
  downloadZip: () => Promise<void>;

  isAdmin: boolean;
  onBack: () => void;
  onOpenLayoutEditor: () => void;
}