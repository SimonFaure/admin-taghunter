/**
 * Tracks adapter - checkpoint-based course gameplay (legacy `maximus`).
 *
 * Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
 */

import { TracksScenarioDataSchema } from '../../../types/scenario-data';
import type { TracksGameMeta, Checkpoint, CustomFont } from '../../../types/scenario-data';
import { validateTracksConfig } from '../../../creator-ported/utils/publishValidation';
import { extractFileName } from '../../../creator-ported/utils/mediaUrl';
import { commonMediaSlots } from '../../shell/commonMediaSlots';
import { synthesizeLegacyTranslations, flattenToDefault } from '../../i18n/synthesizeLegacyTranslations';
import type { Lang } from '../../i18n/types';
import type { ScenarioAdapter, MediasColumn, EnumeratedMedia, ZipPayloadContext } from '../../types';
import { TracksBody } from './TracksBody';
import { tracksMediaSlots, tracksImageFields, tracksSoundFields } from './mediaSlots';
import { defaultTracksGameMeta } from './defaults';

const ALL_IMAGE_FIELDS: readonly string[] = tracksImageFields;
const ALL_SOUND_FIELDS: readonly string[] = tracksSoundFields;

function buildMediasColumn(gameMeta: TracksGameMeta, uniqid: string): MediasColumn {
  const meta = gameMeta as unknown as Record<string, string | undefined>;
  const images: Record<string, string> = {};
  for (const field of ALL_IMAGE_FIELDS) {
    const v = meta[field];
    if (v) images[field] = extractFileName(v);
  }
  const sounds: Record<string, string> = {};
  for (const field of ALL_SOUND_FIELDS) {
    const v = meta[field];
    if (v) sounds[field] = extractFileName(v);
  }
  const checkpoints = (gameMeta.checkpoints ?? []).map((c: Checkpoint, idx: number) => ({
    checkpoint_id: c.id,
    checkpoint_number: idx + 1,
    image: extractFileName(c.image ?? ''),
  }));
  const scenarioVideo = meta.scenario_video;
  const video = scenarioVideo ? `/media/${uniqid}/${extractFileName(scenarioVideo)}` : '';
  return { images, sounds, video, videos: {}, checkpoints };
}

function cleanGameMetaForData(gameMeta: TracksGameMeta): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(gameMeta as unknown as Record<string, unknown>) };
  for (const field of ALL_IMAGE_FIELDS) delete copy[field];
  for (const field of ALL_SOUND_FIELDS) delete copy[field];
  delete copy.scenario_video;

  if (Array.isArray(copy.checkpoints)) {
    copy.checkpoints = (copy.checkpoints as Checkpoint[]).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      position: c.position,
      points: c.points,
    }));
  }
  return copy;
}

function enumerateMedia(gameMeta: TracksGameMeta): readonly EnumeratedMedia[] {
  const meta = gameMeta as unknown as Record<string, string | undefined>;
  const out: EnumeratedMedia[] = [];

  for (const field of ALL_IMAGE_FIELDS) {
    const v = meta[field];
    if (v) out.push({ fieldName: field, filename: v, kind: 'image' });
  }
  for (const field of ALL_SOUND_FIELDS) {
    const v = meta[field];
    if (v) out.push({ fieldName: field, filename: v, kind: 'sound' });
  }
  if (meta.scenario_video) {
    out.push({ fieldName: 'scenario_video', filename: meta.scenario_video, kind: 'video' });
  }
  (gameMeta.checkpoints ?? []).forEach((c: Checkpoint, cIdx: number) => {
    if (c.image) {
      out.push({ fieldName: `checkpoint_${cIdx}_image`, filename: c.image, kind: 'image' });
    }
  });
  ((gameMeta.custom_fonts as CustomFont[] | undefined) ?? []).forEach((cf, cfIdx) => {
    (cf.faces ?? []).forEach((face, faceIdx) => {
      if (face.filename) {
        out.push({ fieldName: `custom_font_${cfIdx}_${faceIdx}`, filename: face.filename, kind: 'font' });
      }
    });
  });
  return out;
}

/**
 * Build the FULL ZIP `game-data.json` for tracks. Faithfully mirrors the
 * legacy `maximus` runtime contract so the playground keeps reading the same
 * shape; translatable fields collapse to default-language strings, and a
 * `translations` envelope is synthesized for back-compat.
 */
function buildZipPayload(
  ctx: ZipPayloadContext<TracksGameMeta>,
  relativeUrl: (filename: string) => string,
): Record<string, unknown> {
  const gm = ctx.gameMeta;
  const dl = ctx.defaultLanguage as Lang;

  const game_meta = {
    title: flattenToDefault(gm.title, dl),
    font: gm.font,
    font_color: gm.font_color,
    game_public: gm.game_public,
    default_time: gm.default_time,
    default_time_malus: gm.default_time_malus,
    auto_reset: gm.auto_reset,
    delay_auto_reset: gm.delay_auto_reset,
    scenario_version: gm.scenario_version,
    custom_fonts: gm.custom_fonts,

    // Tracks-specific scalars
    display_score: gm.display_score,
    clues_page: gm.clues_page,
    routes: gm.routes,
    displays: gm.displays,
    play_modes: gm.play_modes,
    score_types: gm.score_types,
    checkpoints_unique_image: gm.checkpoints_unique_image,
    checkpoint_image_width_percentage: gm.checkpoint_image_width_percentage,
    scenario_default_pattern: gm.scenario_default_pattern,

    // Checkpoints - flattened titles/descriptions for legacy consumers
    checkpoints: (gm.checkpoints ?? []).map((c: Checkpoint, idx: number) => ({
      id: c.id,
      number: idx + 1,
      title: flattenToDefault((c as Record<string, unknown>).title, dl),
      description: flattenToDefault((c as Record<string, unknown>).description, dl),
      position: c.position,
      points: c.points,
    })),

    // Authored text overlays - passed through with their Localized<string>
    // `text` maps intact (the playground runtime's `readLocalized` resolves
    // them at the player's selected language). Position lives here too:
    // entries without a position are skipped at render time, so unplaced
    // authored entries still travel but are invisible.
    text_elements: (gm as Record<string, unknown>).text_elements,

    // Author-defined text-element categories carrying typography defaults.
    // Per-element fields override category fields, which override the
    // scenario default. The playground runtime indexes by id and resolves
    // the inheritance chain in TracksGameRenderer.
    // Plan: tracks-text-elements-categories.md
    text_categories: (gm as Record<string, unknown>).text_categories,
  };

  const meta = gm as unknown as Record<string, string | undefined>;

  const imagesEntries: [string, string][] = [];
  for (const field of ALL_IMAGE_FIELDS) {
    const v = relativeUrl(meta[field] ?? '');
    if (v) imagesEntries.push([field, v]);
  }

  const sounds = ALL_SOUND_FIELDS
    .map((field) => {
      const v = relativeUrl(meta[field] ?? '');
      return v ? { sound_type: field, sound_file: v } : null;
    })
    .filter((x): x is { sound_type: string; sound_file: string } => x !== null);

  const checkpointsMedia = (gm.checkpoints ?? [])
    .map((c: Checkpoint, idx: number) => ({
      checkpoint_id: c.id,
      checkpoint_number: idx + 1,
      image: relativeUrl(c.image ?? ''),
    }))
    .filter((c) => c.image && c.image !== '');

  return {
    scenario: {
      id: ctx.scenarioId,
      name: ctx.title,
      uniqid: ctx.uniqid,
      scenario_type: ctx.scenarioType,
      default_pattern_id: null,
      default_pattern_slug: null,
    },
    layout: ctx.scenarioLayout,
    game_data: {
      game_meta,
      translations: synthesizeLegacyTranslations(
        gm,
        tracksAdapter.capabilities,
        ctx.availableLanguages,
        ctx.defaultLanguage,
      ),
      default_language: ctx.defaultLanguage,
      available_languages: ctx.availableLanguages,
    },
    medias: {
      images: Object.fromEntries(imagesEntries),
      sounds,
      videos: meta.scenario_video
        ? [{ video_file: relativeUrl(extractFileName(meta.scenario_video)) }]
        : [],
      checkpoints: checkpointsMedia,
    },
  };
}

export const tracksAdapter: ScenarioAdapter<TracksGameMeta> = {
  kind: 'tracks',
  label: 'Track',
  capabilities: {
    hasLevels: false,
    hasOverscores: false,
    supportsProductTemplate: true,
    hasTranslatableArrays: ['checkpoints'],
  },
  mediaSlots: [...commonMediaSlots, ...tracksMediaSlots],
  defaultConfig: defaultTracksGameMeta,
  validator: (gm, title, description) =>
    validateTracksConfig(gm as unknown, title, description),
  dataSchema: TracksScenarioDataSchema,
  Body: TracksBody,
  buildMediasColumn,
  cleanGameMetaForData,
  enumerateMedia,
  buildZipPayload,
  zipFilenamePrefix: 'tracks',
};
