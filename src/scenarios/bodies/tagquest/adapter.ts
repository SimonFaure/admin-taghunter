/**
 * Tagquest adapter - type-specific contract for the shell.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { TagquestScenarioDataSchema } from '../../../types/scenario-data';
import type { TagquestGameMeta, Quest, Overscore, CustomFont } from '../../../types/scenario-data';
import { validateTagquestConfig } from '../../../creator-ported/utils/publishValidation';
import { extractFileName } from '../../../creator-ported/utils/mediaUrl';
import { commonMediaSlots } from '../../shell/commonMediaSlots';
import { synthesizeLegacyTranslations, flattenToDefault } from '../../i18n/synthesizeLegacyTranslations';
import type { Lang } from '../../i18n/types';
import type { ScenarioAdapter, MediasColumn, EnumeratedMedia } from '../../types';
import { TagquestBody } from './TagquestBody';
import { tagquestMediaSlots, tagquestImageFields, tagquestSoundFields } from './mediaSlots';
import { defaultTagquestGameMeta } from './defaults';

const ALL_IMAGE_FIELDS: readonly string[] = tagquestImageFields;
const ALL_SOUND_FIELDS: readonly string[] = tagquestSoundFields;

export const TAGQUEST_MAX_QUESTS = 6;

function buildMediasColumn(gameMeta: TagquestGameMeta, uniqid: string): MediasColumn {
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
  const quests = (gameMeta.quests ?? []).slice(0, TAGQUEST_MAX_QUESTS).map((q: Quest, index: number) => ({
    quest_index: index,
    main_image: extractFileName(q.main_image ?? ''),
    sound: extractFileName(q.sound ?? ''),
    image_1: extractFileName(q.image_1 ?? ''),
    image_2: extractFileName(q.image_2 ?? ''),
    image_3: extractFileName(q.image_3 ?? ''),
    image_4: extractFileName(q.image_4 ?? ''),
  }));
  const overscores = (gameMeta.overscores ?? []).map((o: Overscore) => ({
    overscore_step: o.overscore_step,
    image_overscore_step: extractFileName(o.image_overscore_step ?? ''),
  }));
  // `medias.video` is a single string carrying the full /media/<uniqid>/...
  // path for ScenarioDetailView compatibility. Bare filename comes from the
  // `scenario_video` slot uploaded via scenario_files.php?action=upload_video.
  const scenarioVideo = meta.scenario_video;
  const video = scenarioVideo ? `/media/${uniqid}/${extractFileName(scenarioVideo)}` : '';
  return { images, sounds, video, quests, overscores };
}

function cleanGameMetaForData(gameMeta: TagquestGameMeta): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(gameMeta as unknown as Record<string, unknown>) };
  for (const field of ALL_IMAGE_FIELDS) delete copy[field];
  for (const field of ALL_SOUND_FIELDS) delete copy[field];
  delete copy.scenario_video;

  if (Array.isArray(copy.quests)) {
    copy.quests = (copy.quests as Quest[])
      .slice(0, TAGQUEST_MAX_QUESTS)
      .map((q) => ({ points: q.points, name: q.name }));
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

function enumerateMedia(gameMeta: TagquestGameMeta): readonly EnumeratedMedia[] {
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
  (gameMeta.quests ?? []).forEach((q: Quest, qIdx: number) => {
    if (q.main_image) out.push({ fieldName: `quest_${qIdx}_main_image`, filename: q.main_image, kind: 'image' });
    if (q.sound) out.push({ fieldName: `quest_${qIdx}_sound`, filename: q.sound, kind: 'sound' });
    (['image_1', 'image_2', 'image_3', 'image_4'] as const).forEach((imgKey, imgIdx) => {
      const img = q[imgKey];
      if (img) {
        out.push({ fieldName: `quest_${qIdx}_image_${imgIdx + 1}`, filename: img, kind: 'image' });
      }
    });
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
  // Author-uploaded custom font files - bundled so they travel in the ZIP.
  ((gameMeta.custom_fonts as CustomFont[] | undefined) ?? []).forEach((cf, cfIdx) => {
    (cf.faces ?? []).forEach((face, faceIdx) => {
      if (face.filename) {
        out.push({ fieldName: `custom_font_${cfIdx}_${faceIdx}`, filename: face.filename, kind: 'font' });
      }
    });
  });
  return out;
}

function buildZipPayload(
  ctx: import('../../types').ZipPayloadContext<TagquestGameMeta>,
  relativeUrl: (filename: string) => string,
): Record<string, unknown> {
  const gameMeta = ctx.gameMeta;
  const dl = ctx.defaultLanguage as Lang;
  const meta = gameMeta as unknown as Record<string, string | undefined>;
  const game_media_images: Record<string, string> = {};
  for (const field of ALL_IMAGE_FIELDS) game_media_images[field] = relativeUrl(meta[field] ?? '');
  const game_sounds: Record<string, string> = {};
  for (const field of ALL_SOUND_FIELDS) game_sounds[field] = relativeUrl(meta[field] ?? '');

  // Stage 3 back-compat: ZIP keeps the legacy default-lang-flattened shape
  // until ZIP consumers are updated. Localized<string> fields collapse to
  // their default-language value.
  const game_meta_subset = {
    font: gameMeta.font,
    custom_fonts: gameMeta.custom_fonts,
    font_color: gameMeta.font_color,
    level_font_color: gameMeta.level_font_color,
    game_public: gameMeta.game_public,
    animation_image_duration: gameMeta.animation_image_duration,
    animation_message_duration: gameMeta.animation_message_duration,
    end_station: gameMeta.end_station,
    default_time: gameMeta.default_time,
    scenario_version: gameMeta.scenario_version,
    default_time_malus: gameMeta.default_time_malus,
    combo_2_quests: gameMeta.combo_2_quests,
    combo_4_quests: gameMeta.combo_4_quests,
    combo_6_quests: gameMeta.combo_6_quests,
    malus_points: gameMeta.malus_points,
    malus_station_number: gameMeta.malus_station_number,
    late_malus_points: gameMeta.late_malus_points,
    use_default_template: gameMeta.use_default_template,
    custom_template: gameMeta.custom_template,
  };

  const flatLevels: Record<string, unknown> = {};
  for (const [k, level] of Object.entries(gameMeta.levels ?? {})) {
    const lvl = level as Record<string, unknown>;
    flatLevels[k] = {
      ...lvl,
      name: flattenToDefault(lvl.name, dl),
      description: flattenToDefault(lvl.description, dl),
    };
  }

  return {
    scenario: {
      title: ctx.title,
      description: ctx.description,
      game_type: 'tagquest',
      uniqid: ctx.uniqid,
      scenario_type: ctx.scenarioType,
    },
    layout: ctx.scenarioLayout,
    game_data: {
      game_meta: game_meta_subset,
      game_media_images,
      game_sounds,
      levels: flatLevels,
      quests: (gameMeta.quests ?? []).slice(0, TAGQUEST_MAX_QUESTS).map((q: Quest) => ({
        ...q,
        name: flattenToDefault(q.name, dl),
        main_image: relativeUrl(q.main_image ?? ''),
        sound: relativeUrl(q.sound ?? ''),
        image_1: relativeUrl(q.image_1 ?? ''),
        image_2: relativeUrl(q.image_2 ?? ''),
        image_3: relativeUrl(q.image_3 ?? ''),
        image_4: relativeUrl(q.image_4 ?? ''),
      })),
      overscores: (gameMeta.overscores ?? []).map((o) => ({
        ...o,
        name_overscore_step: flattenToDefault(
          (o as Record<string, unknown>).name_overscore_step,
          dl,
        ),
      })),
    },
    translations: synthesizeLegacyTranslations(
      gameMeta,
      tagquestAdapter.capabilities,
      ctx.availableLanguages,
      ctx.defaultLanguage,
    ),
  };
}

export const tagquestAdapter: ScenarioAdapter<TagquestGameMeta> = {
  kind: 'tagquest',
  label: 'Tagquest',
  capabilities: {
    hasLevels: true,
    hasOverscores: false,
    supportsProductTemplate: true,
    hasTranslatableArrays: ['quests', 'levels'],
  },
  mediaSlots: [...commonMediaSlots, ...tagquestMediaSlots],
  defaultConfig: defaultTagquestGameMeta,
  validator: (gm, title, description) =>
    validateTagquestConfig(gm as unknown, title, description),
  dataSchema: TagquestScenarioDataSchema,
  Body: TagquestBody,
  buildMediasColumn,
  cleanGameMetaForData,
  enumerateMedia,
  buildZipPayload,
  zipFilenamePrefix: 'tagquest',
};