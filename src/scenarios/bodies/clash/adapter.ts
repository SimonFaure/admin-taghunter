/**
 * Clash adapter — TagQuest-derived clans/territories mode.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 *
 * Media model note: Clash's nested clan / combination / territory images are
 * kept INLINE in `data.game_meta` rather than partitioned into a
 * medias.clans / medias.territories bucket. The shell's load path only
 * re-hydrates the quests/enigmas/checkpoints/overscores arrays from the
 * medias column; keeping Clash's new arrays inline means they round-trip
 * through the editor without bespoke hydration code. `enumerateMedia` still
 * lists every nested file so publish-upload + ZIP bundling pick them up.
 */

import { ClashScenarioDataSchema } from '../../../types/scenario-data';
import type {
  ClashGameMeta,
  ClashClan,
  ClashTerritory,
  ClashCombination,
} from '../../../types/scenario-data';
import { validateClashConfig } from '../../../creator-ported/utils/publishValidation';
import { extractFileName } from '../../../creator-ported/utils/mediaUrl';
import { flattenToDefault } from '../../i18n/synthesizeLegacyTranslations';
import type { Lang } from '../../i18n/types';
import { commonMediaSlots } from '../../shell/commonMediaSlots';
import type { ScenarioAdapter, MediasColumn, EnumeratedMedia } from '../../types';
import { ClashBody } from './ClashBody';
import { clashMediaSlots, clashImageFields, clashSoundFields } from './mediaSlots';
import { defaultClashGameMeta } from './defaults';

const ALL_IMAGE_FIELDS: readonly string[] = clashImageFields;
const ALL_SOUND_FIELDS: readonly string[] = clashSoundFields;

const COMBO_PIECE_KEYS = ['piece_1', 'piece_2', 'piece_3', 'main'] as const;

function buildMediasColumn(gameMeta: ClashGameMeta): MediasColumn {
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
  // Nested clan/territory/combination images stay inline in data.game_meta
  // (see header note) — the medias column only carries flat top-level fields.
  return { images, sounds };
}

function cleanGameMetaForData(gameMeta: ClashGameMeta): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(gameMeta as unknown as Record<string, unknown>) };
  // Strip only the FLAT top-level image fields (they live in medias.images);
  // nested clan/combination/territory media is kept inline on purpose.
  for (const field of ALL_IMAGE_FIELDS) delete copy[field];
  for (const field of ALL_SOUND_FIELDS) delete copy[field];
  return copy;
}

function enumerateMedia(gameMeta: ClashGameMeta): readonly EnumeratedMedia[] {
  const meta = gameMeta as unknown as Record<string, string | undefined>;
  const out: EnumeratedMedia[] = [];

  for (const field of ALL_IMAGE_FIELDS) {
    const v = meta[field];
    if (v) out.push({ fieldName: field, filename: v, kind: 'image' });
  }

  (gameMeta.clans ?? []).forEach((clan: ClashClan, ci: number) => {
    if (clan.seal) out.push({ fieldName: `clan_${ci}_seal`, filename: clan.seal, kind: 'image' });
  });

  (gameMeta.territories ?? []).forEach((t: ClashTerritory, ti: number) => {
    if (t.complete_image) {
      out.push({ fieldName: `territory_${ti}_complete`, filename: t.complete_image, kind: 'image' });
    }
    (t.combinations ?? []).forEach((c: ClashCombination, idx: number) => {
      COMBO_PIECE_KEYS.forEach((key) => {
        const img = c[key];
        if (img) {
          out.push({ fieldName: `territory_${ti}_combo_${idx}_${key}`, filename: img, kind: 'image' });
        }
      });
    });
  });

  // Author-uploaded custom font files — bundled so they travel in the ZIP.
  (gameMeta.custom_fonts ?? []).forEach((cf, cfIdx) => {
    (cf.faces ?? []).forEach((face, faceIdx) => {
      if (face.filename) {
        out.push({ fieldName: `custom_font_${cfIdx}_${faceIdx}`, filename: face.filename, kind: 'font' });
      }
    });
  });

  return out;
}

function buildZipPayload(
  ctx: import('../../types').ZipPayloadContext<ClashGameMeta>,
  relativeUrl: (filename: string) => string,
): Record<string, unknown> {
  const gameMeta = ctx.gameMeta;
  const dl = ctx.defaultLanguage as Lang;
  const meta = gameMeta as unknown as Record<string, string | undefined>;

  const game_media_images: Record<string, string> = {};
  for (const field of ALL_IMAGE_FIELDS) game_media_images[field] = relativeUrl(meta[field] ?? '');

  const clans = (gameMeta.clans ?? []).map((c) => ({
    ...c,
    name: flattenToDefault(c.name, dl),
    seal: relativeUrl(c.seal ?? ''),
  }));

  const territories = (gameMeta.territories ?? []).map((t) => ({
    ...t,
    name: flattenToDefault(t.name, dl),
    complete_image: relativeUrl(t.complete_image ?? ''),
    combinations: (t.combinations ?? []).map((c) => ({
      ...c,
      name: flattenToDefault(c.name, dl),
      piece_1: relativeUrl(c.piece_1 ?? ''),
      piece_2: relativeUrl(c.piece_2 ?? ''),
      piece_3: relativeUrl(c.piece_3 ?? ''),
      main: relativeUrl(c.main ?? ''),
    })),
  }));

  return {
    scenario: {
      title: ctx.title,
      description: ctx.description,
      game_type: 'clash',
      uniqid: ctx.uniqid,
      scenario_type: ctx.scenarioType,
    },
    layout: ctx.scenarioLayout,
    game_data: {
      game_meta: {
        font: gameMeta.font,
        custom_fonts: gameMeta.custom_fonts,
        font_color: gameMeta.font_color,
        game_public: gameMeta.game_public,
        default_time: gameMeta.default_time,
        scenario_version: gameMeta.scenario_version,
        scenario_default_pattern: gameMeta.scenario_default_pattern,
      },
      game_media_images,
      clans,
      territories,
    },
  };
}

export const clashAdapter: ScenarioAdapter<ClashGameMeta> = {
  kind: 'clash',
  label: 'Clash',
  capabilities: {
    hasLevels: false,
    hasOverscores: false,
    hasPodium: false,
    supportsProductTemplate: false,
    hasTranslatableArrays: [],
  },
  mediaSlots: [...commonMediaSlots, ...clashMediaSlots],
  defaultConfig: defaultClashGameMeta,
  validator: (gm, title, description) => validateClashConfig(gm as unknown, title, description),
  dataSchema: ClashScenarioDataSchema,
  Body: ClashBody,
  buildMediasColumn,
  cleanGameMetaForData,
  enumerateMedia,
  buildZipPayload,
  zipFilenamePrefix: 'clash',
};
