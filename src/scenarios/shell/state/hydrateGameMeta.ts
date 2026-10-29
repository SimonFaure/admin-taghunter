/**
 * Rebuild the editor's flat working copy of a scenario: `data.game_meta` with
 * the file names of the `medias` column laid back onto it.
 *
 * On save each adapter's `cleanGameMetaForData` strips media file names out of
 * game_meta and `buildMediasColumn` files them in `medias`; this is the
 * inverse. Shared by the editor (hydration) and the Scenario overview, which
 * runs the publish validators on the same shape the editor validates.
 */

import { extractFileName } from '../../../creator-ported/utils/mediaUrl';

export interface ParsedMedias {
  images?: Record<string, string>;
  sounds?: Record<string, string>;
  video?: string;
  quests?: Array<Record<string, string | number | undefined>>;
  enigmas?: Array<Record<string, string | undefined>>;
  overscores?: Array<Record<string, string | undefined>>;
  levels?: Record<string, string>;
  checkpoints?: Array<Record<string, string | number | undefined>>;
}

/** Overlay `medias` onto `merged` IN PLACE (nested items are mutated too). */
export function mergeMediasIntoGameMeta(
  merged: Record<string, unknown>,
  parsedMedia: ParsedMedias | null | undefined,
): void {
  if (parsedMedia?.images) for (const [k, v] of Object.entries(parsedMedia.images)) merged[k] = v;
  if (parsedMedia?.sounds) for (const [k, v] of Object.entries(parsedMedia.sounds)) merged[k] = v;
  // medias.video is a single full path "/media/<uniqid>/scenario_video_*.ext"
  // for ScenarioDetailView compat; strip to bare filename for the editor.
  if (parsedMedia?.video) merged.scenario_video = extractFileName(parsedMedia.video);

  // Tagquest stores per-quest image/sound filenames in medias.quests
  // (cleanGameMetaForData strips them out of data.game_meta.quests on save;
  // the legacy zip importer also writes mapped filenames there). Overlay
  // them onto merged.quests by array index so the editor sees real files.
  if (parsedMedia?.quests && Array.isArray(merged.quests)) {
    const inMerged = merged.quests as Array<Record<string, unknown>>;
    const QUEST_MEDIA_KEYS = ['main_image', 'sound', 'image_1', 'image_2', 'image_3', 'image_4'] as const;
    parsedMedia.quests.forEach((mq, i) => {
      if (!mq || i >= inMerged.length) return;
      for (const k of QUEST_MEDIA_KEYS) {
        const v = mq[k];
        if (typeof v === 'string' && v) inMerged[i][k] = v;
      }
    });
  }

  // Mystery equivalent: medias.enigmas[] is the source of truth for
  // per-enigma good_answer_image (cleanGameMetaForData strips it off
  // gameMeta.enigmas on save). Match by enigma_number - the medias array
  // only contains entries that HAVE an image, so indices may not align.
  if (parsedMedia?.enigmas && Array.isArray(merged.enigmas)) {
    const inMerged = merged.enigmas as Array<Record<string, unknown>>;
    const byNumber = new Map<string, Record<string, string | undefined>>();
    for (const em of parsedMedia.enigmas) {
      if (!em) continue;
      const n = em.enigma_number;
      if (typeof n === 'string' && n !== '') byNumber.set(n, em);
    }
    inMerged.forEach((e) => {
      const n = e.number;
      if (typeof n !== 'string' || n === '') return;
      const m = byNumber.get(n);
      if (m?.good_answer_image) e.good_answer_image = m.good_answer_image;
      if (m?.wrong_answer_image) e.wrong_answer_image = m.wrong_answer_image;
      // GO 4-answer extra wrong images.
      if (m?.wrong_answer_image_2) e.wrong_answer_image_2 = m.wrong_answer_image_2;
      if (m?.wrong_answer_image_3) e.wrong_answer_image_3 = m.wrong_answer_image_3;
    });
  }

  // Tracks: medias.checkpoints[] is the source of truth for per-checkpoint
  // images (cleanGameMetaForData strips checkpoint.image; buildMediasColumn
  // emits {checkpoint_id, checkpoint_number, image}). Match by
  // checkpoint_id first (new uuid), then by checkpoint_number for legacy
  // imports where the editor's local id hasn't been written yet.
  if (parsedMedia?.checkpoints && Array.isArray(merged.checkpoints)) {
    const inMerged = merged.checkpoints as Array<Record<string, unknown>>;
    type CpMedia = Record<string, string | number | undefined>;
    const byId = new Map<string, CpMedia>();
    const byNumber = new Map<string, CpMedia>();
    for (const cm of parsedMedia.checkpoints) {
      if (!cm) continue;
      if (typeof cm.checkpoint_id === 'string' && cm.checkpoint_id !== '') {
        byId.set(cm.checkpoint_id, cm);
      }
      const n =
        typeof cm.checkpoint_number === 'string'
          ? cm.checkpoint_number
          : typeof cm.checkpoint_number === 'number'
            ? String(cm.checkpoint_number)
            : '';
      if (n !== '') byNumber.set(n, cm);
    }
    inMerged.forEach((c, idx) => {
      const id = typeof c.id === 'string' ? c.id : '';
      const fallbackKey = String(idx + 1);
      const m = (id && byId.get(id)) || byNumber.get(fallbackKey);
      if (m && typeof m.image === 'string' && m.image !== '') c.image = m.image;
    });
  }

  // Same for overscores → image_overscore_step (matched by overscore_step).
  if (parsedMedia?.overscores && Array.isArray(merged.overscores)) {
    const inMerged = merged.overscores as Array<Record<string, unknown>>;
    const byStep = new Map<string, Record<string, string | undefined>>();
    for (const om of parsedMedia.overscores) {
      if (!om) continue;
      const s = om.overscore_step;
      if (typeof s === 'string' && s !== '') byStep.set(s, om);
    }
    inMerged.forEach((o) => {
      const s = o.overscore_step;
      if (typeof s !== 'string' || s === '') return;
      const m = byStep.get(s);
      if (m?.image_overscore_step) o.image_overscore_step = m.image_overscore_step;
    });
  }

  // Mystery's level gauge images live in medias.levels (legacy
  // "levels" overload - these are 4 image fields, not gameplay levels).
  // Hydrate them onto gameMeta the same way as medias.images.
  if (parsedMedia?.levels) {
    for (const [k, v] of Object.entries(parsedMedia.levels)) {
      if (typeof v === 'string' && v) merged[k] = v;
    }
  }
}
