/**
 * Tracks stub adapter — exists ONLY to verify the shell typechecks against
 * the ScenarioAdapter contract. Not registered with the registry.
 *
 * Slice 2A. Replace with a real tracksAdapter when the tracks gameplay model
 * is decided (see project_game_creation_analysis.md / wiggly-baking-spring.md).
 */

import { z } from 'zod';
import type { ScenarioAdapter } from '../../types';
import { TracksBody } from './TracksStubBody';

interface TracksStubGameMeta {
  title: string;
}

const TracksStubDataSchema = z.looseObject({
  game_meta: z.looseObject({ title: z.string() }),
  translations: z.record(z.string(), z.unknown()),
  default_language: z.string(),
  available_languages: z.array(z.string()),
});

export const tracksStubAdapter: ScenarioAdapter<TracksStubGameMeta> = {
  kind: 'tracks',
  label: 'Tracks (stub)',
  capabilities: {
    hasLevels: false,
    hasOverscores: false,
    supportsProductTemplate: false,
    hasTranslatableArrays: [],
  },
  mediaSlots: [],
  defaultConfig: () => ({ title: '' }),
  validator: () => ({ valid: true, errors: [], warnings: [] }),
  dataSchema: TracksStubDataSchema,
  Body: TracksBody,
  buildMediasColumn: () => ({ images: {}, sounds: {} }),
  cleanGameMetaForData: (gm) => ({ ...gm }),
  enumerateMedia: () => [],
  buildZipPayload: (ctx) => ({ game_data: { game_meta: ctx.gameMeta } }),
  zipFilenamePrefix: 'tracks',
};