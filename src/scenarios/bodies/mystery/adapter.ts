/**
 * Mystery adapter — type-specific contract for the shell.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { MysteryScenarioDataSchema } from '../../../types/scenario-data';
import type { MysteryGameMeta, Enigma, Overscore, CustomFont } from '../../../types/scenario-data';
import { validateMysteryConfig } from '../../../creator-ported/utils/publishValidation';
import { extractFileName } from '../../../creator-ported/utils/mediaUrl';
import { commonMediaSlots } from '../../shell/commonMediaSlots';
import { synthesizeLegacyTranslations, flattenToDefault } from '../../i18n/synthesizeLegacyTranslations';
import type { Lang } from '../../i18n/types';
import type { ScenarioAdapter, MediasColumn, EnumeratedMedia, ZipPayloadContext } from '../../types';
import { MysteryBody } from './MysteryBody';
import {
  mysteryMediaSlots,
  mysteryImageFields,
  mysteryLevelImageFields,
  mysterySoundFields,
} from './mediaSlots';
import { defaultMysteryGameMeta } from './defaults';

const ALL_IMAGE_FIELDS: readonly string[] = mysteryImageFields;
const ALL_LEVEL_IMAGE_FIELDS: readonly string[] = mysteryLevelImageFields;
const ALL_SOUND_FIELDS: readonly string[] = mysterySoundFields;

function buildMediasColumn(gameMeta: MysteryGameMeta, uniqid: string): MediasColumn {
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
  // NOTE: mystery's `medias.levels` is keyed-record-of-images, not the
  // gameplay levels. Legacy overload of the name; preserved as-is.
  const levels: Record<string, string> = {};
  for (const field of ALL_LEVEL_IMAGE_FIELDS) {
    const v = meta[field];
    if (v) levels[field] = extractFileName(v);
  }
  const enigmas = (gameMeta.enigmas ?? []).map((e: Enigma) => ({
    enigma_number: e.number,
    good_answer_image: extractFileName(e.good_answer_image ?? ''),
    wrong_answer_image: extractFileName(e.wrong_answer_image ?? ''),
  }));
  const overscores = (gameMeta.overscores ?? []).map((o: Overscore) => ({
    overscore_step: o.overscore_step,
    image_overscore_step: extractFileName(o.image_overscore_step ?? ''),
  }));
  // `medias.video` is a single string. Emit the full "/media/<uniqid>/<file>"
  // path that ScenarioDetailView already reads. Bare filename comes from
  // `scenario_video` slot (uploaded via scenario_files.php?action=upload_video).
  const scenarioVideo = meta.scenario_video;
  const video = scenarioVideo ? `/media/${uniqid}/${extractFileName(scenarioVideo)}` : '';
  return { images, sounds, video, videos: {}, levels, enigmas, overscores };
}

function cleanGameMetaForData(gameMeta: MysteryGameMeta): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(gameMeta as unknown as Record<string, unknown>) };
  for (const field of ALL_IMAGE_FIELDS) delete copy[field];
  for (const field of ALL_LEVEL_IMAGE_FIELDS) delete copy[field];
  for (const field of ALL_SOUND_FIELDS) delete copy[field];
  delete copy.scenario_video;

  if (Array.isArray(copy.enigmas)) {
    copy.enigmas = (copy.enigmas as Enigma[]).map((e) => ({
      number: e.number,
      text: e.text,
      good_answer_points: e.good_answer_points,
      wrong_answer_points: e.wrong_answer_points,
    }));
  }
  if (Array.isArray(copy.overscores)) {
    copy.overscores = (copy.overscores as Overscore[]).map((o) => ({
      overscore_step: o.overscore_step,
      overscore_score: o.overscore_score,
      name_overscore_step: o.name_overscore_step,
    }));
  }
  return copy;
}

function enumerateMedia(gameMeta: MysteryGameMeta): readonly EnumeratedMedia[] {
  const meta = gameMeta as unknown as Record<string, string | undefined>;
  const out: EnumeratedMedia[] = [];

  for (const field of ALL_IMAGE_FIELDS) {
    const v = meta[field];
    if (v) out.push({ fieldName: field, filename: v, kind: 'image' });
  }
  for (const field of ALL_LEVEL_IMAGE_FIELDS) {
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
  (gameMeta.enigmas ?? []).forEach((e: Enigma, eIdx: number) => {
    if (e.good_answer_image) {
      out.push({ fieldName: `enigma_${eIdx}_good_answer_image`, filename: e.good_answer_image, kind: 'image' });
    }
    if (e.wrong_answer_image) {
      out.push({ fieldName: `enigma_${eIdx}_wrong_answer_image`, filename: e.wrong_answer_image, kind: 'image' });
    }
  });
  (gameMeta.overscores ?? []).forEach((o: Overscore, oIdx: number) => {
    if (o.image_overscore_step) {
      out.push({
        fieldName: `overscore_${oIdx}_image`,
        filename: o.image_overscore_step,
        kind: 'image',
      });
    }
  });
  // Author-uploaded custom font files — bundled so they travel in the ZIP.
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
 * Mystery's ZIP `game-data.json` shape — meaningfully different from
 * tagquest's. Faithfully reproduces the legacy MysteryConfig.tsx:1026 output
 * so the playground keeps consuming it without any runtime change.
 */
function buildZipPayload(
  ctx: ZipPayloadContext<MysteryGameMeta>,
  relativeUrl: (filename: string) => string,
): Record<string, unknown> {
  const gm = ctx.gameMeta;
  const dl = ctx.defaultLanguage as Lang;

  // Stage 3 back-compat: ZIP keeps the legacy default-lang-flattened shape.
  // Localized<string> fields collapse to their default-language value.
  const flatLevels: Record<string, unknown> = {};
  for (const [k, level] of Object.entries(gm.levels ?? {})) {
    const lvl = level as Record<string, unknown>;
    flatLevels[k] = {
      ...lvl,
      name: flattenToDefault(lvl.name, dl),
      description: flattenToDefault(lvl.description, dl),
    };
  }

  const game_meta = {
    font: gm.font,
    title: flattenToDefault(gm.title, dl),
    levels: flatLevels,
    enigmas: (gm.enigmas ?? []).map((e: Enigma) => ({
      text: flattenToDefault((e as Record<string, unknown>).text, dl),
      number: e.number,
      good_answer_points: e.good_answer_points,
      wrong_answer_points: e.wrong_answer_points,
    })),
    font_color: gm.font_color,
    overscores: (gm.overscores ?? []).map((o: Overscore) => ({
      overscore_step: o.overscore_step,
      name_overscore_step: flattenToDefault(
        (o as Record<string, unknown>).name_overscore_step,
        dl,
      ),
    })),
    game_public: gm.game_public,
    custom_fonts: gm.custom_fonts,
    default_time: gm.default_time,
    game_version: '10.0',
    gauge_filling: gm.gauge_filling,
    overscore_steps: gm.overscore_steps,
    score_full_game: gm.score_full_game,
    level_font_color: gm.level_font_color,
    scenario_version: gm.scenario_version,
    number_of_enigmas: gm.number_of_enigmas,
    default_time_malus: gm.default_time_malus,
    animation_image_duration: gm.animation_image_duration,
    animation_enigma_duration: gm.animation_enigma_duration,
    animation_message_duration: gm.animation_message_duration,
  };

  const meta = gm as unknown as Record<string, string | undefined>;

  const imagesEntries: [string, string][] = [];
  for (const field of [...ALL_IMAGE_FIELDS, ...ALL_LEVEL_IMAGE_FIELDS]) {
    const v = relativeUrl(meta[field] ?? '');
    if (v) imagesEntries.push([field, v]);
  }

  const sounds = ALL_SOUND_FIELDS
    .map((field) => {
      const v = relativeUrl(meta[field] ?? '');
      return v ? { sound_type: field, sound_file: v } : null;
    })
    .filter((x): x is { sound_type: string; sound_file: string } => x !== null);

  const enigmasMedia = (gm.enigmas ?? [])
    .map((e: Enigma) => ({
      enigma_number: e.number,
      good_answer_image: relativeUrl(e.good_answer_image ?? ''),
      wrong_answer_image: relativeUrl(e.wrong_answer_image ?? ''),
    }))
    .filter((e) => (e.good_answer_image && e.good_answer_image !== '') || (e.wrong_answer_image && e.wrong_answer_image !== ''));

  const overscoresMedia = (gm.overscores ?? [])
    .map((o: Overscore) => ({
      overscore_step: o.overscore_step,
      image_overscore_step: relativeUrl(o.image_overscore_step ?? ''),
    }))
    .filter((o) => o.image_overscore_step && o.image_overscore_step !== '');

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
        mysteryAdapter.capabilities,
        ctx.availableLanguages,
        ctx.defaultLanguage,
      ),
      default_language: ctx.defaultLanguage,
      available_languages: ctx.availableLanguages,
    },
    medias: {
      images: Object.fromEntries(imagesEntries),
      levels: [],
      sounds,
      videos: meta.scenario_video
        ? [{ video_file: relativeUrl(extractFileName(meta.scenario_video)) }]
        : [],
      enigmas: enigmasMedia,
      overscores: overscoresMedia,
    },
  };
}

export const mysteryAdapter: ScenarioAdapter<MysteryGameMeta> = {
  kind: 'mystery',
  label: 'Mystery',
  capabilities: {
    hasLevels: true,
    hasOverscores: true,
    hasPodium: true,
    supportsProductTemplate: false,
    hasTranslatableArrays: ['enigmas', 'levels', 'overscores'],
  },
  mediaSlots: [...commonMediaSlots, ...mysteryMediaSlots],
  defaultConfig: defaultMysteryGameMeta,
  validator: (gm, title, description) =>
    validateMysteryConfig(gm as unknown, title, description),
  dataSchema: MysteryScenarioDataSchema,
  Body: MysteryBody,
  buildMediasColumn,
  cleanGameMetaForData,
  enumerateMedia,
  buildZipPayload,
  zipFilenamePrefix: 'mystery',
};
