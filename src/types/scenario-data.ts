/**
 * Canonical types + Zod schemas for the on-disk shape of `scenarios.data` and `scenarios.medias`.
 *
 * Stage 1 of the game-creation refactor (see plans/game-creation-stage-1-types-zod.md):
 * shape-preserving. Mirrors what MysteryConfig / TagquestConfig currently write.
 * No discriminator inside `data` — narrow externally by `Scenario.game_type`.
 *
 * Plan: C:\Users\faure\.claude\plans\game-creation-stage-1-types-zod.md
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Stage 3 — Localized<T> primitives                                          */
/*                                                                            */
/* `data.translations[lang] = {full copy}` is GONE. Translatable fields live  */
/* as `Localized<string>` (i.e. `Record<Lang, string>`) maps inline in        */
/* `game_meta`. Slice 3C: schema tightened to record-only.                    */
/* -------------------------------------------------------------------------- */

/**
 * A Localized string is a `Record<Lang, string>` map. Zod doesn't constrain
 * the keys to the SUPPORTED_LANGS enum here; runtime `getLocalized` handles
 * unknown keys gracefully.
 */
export const LocalizedStringSchema = z.record(z.string(), z.string());

export type LocalizedStringValue = z.infer<typeof LocalizedStringSchema>;

/* -------------------------------------------------------------------------- */
/* Shared sub-shapes                                                          */
/* -------------------------------------------------------------------------- */

// Translatable sub-fields (`name`, `description`, `text`,
// `name_overscore_step`) accept BOTH legacy plain strings AND new
// `Localized<string>` records during the Stage 3 transition. Tightened to
// record-only in Slice 3C.
//
// All fields are optional — legacy data is sparse and these schemas are
// warn-only (not gating saves). Validation flags drift in TYPES, not
// missing-by-convention fields.

export const LevelSchema = z.looseObject({
  points: z.string().optional(),
  name: LocalizedStringSchema.optional(),
  description: LocalizedStringSchema.optional(),
});

export const OverscoreSchema = z.looseObject({
  overscore_step: z.string().optional(),
  overscore_score: z.string().optional(),
  name_overscore_step: LocalizedStringSchema.optional(),
  image_overscore_step: z.string().optional(),
});

export const EnigmaSchema = z.looseObject({
  number: z.string().optional(),
  text: LocalizedStringSchema.optional(),
  good_answer_image: z.string().optional(),
  good_answer_points: z.string().optional(),
  wrong_answer_points: z.string().optional(),
});

export const QuestSchema = z.looseObject({
  main_image: z.string().optional(),
  points: z.string().optional(),
  name: LocalizedStringSchema.optional(),
  sound: z.string().optional(),
  image_1: z.string().optional(),
  image_2: z.string().optional(),
  image_3: z.string().optional(),
  image_4: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* Custom fonts — author-uploaded font families bundled with the scenario.    */
/*                                                                            */
/* `game_meta.custom_fonts` is the per-scenario registry; `game_meta.font`    */
/* (a plain string) references a family by name. Each face's `filename` is an */
/* uploaded file under `media/<uniqid>/` — synced to the playground alongside */
/* every other scenario asset. See the plan for the locked data model.        */
/* -------------------------------------------------------------------------- */

export const CustomFontFaceSchema = z.object({
  /** Uploaded filename under `media/<uniqid>/`, e.g. `custom_font_1737.woff2`. */
  filename: z.string(),
  /** CSS numeric weight (100–900). 400 when not detected. */
  weight: z.number(),
  style: z.enum(['normal', 'italic']),
});

export const CustomFontSchema = z.object({
  /** Family name — also the value stored in `game_meta.font` to select it. */
  family: z.string(),
  faces: z.array(CustomFontFaceSchema),
});

export type CustomFontFace = z.infer<typeof CustomFontFaceSchema>;
export type CustomFont = z.infer<typeof CustomFontSchema>;

/* -------------------------------------------------------------------------- */
/* game_meta — the gameplay-config bag                                        */
/*                                                                            */
/* Numeric-looking fields are stored as strings on disk ("60", "100", ...).   */
/* We preserve that as `z.string()` so the schema matches the editor output;  */
/* later refactors can coerce to numbers.                                     */
/* -------------------------------------------------------------------------- */

// All fields optional — legacy data is sparse and these schemas are
// warn-only. Stage 3 validation flags shape drift (e.g. boolean where string
// expected), not missing-by-convention fields.
const BaseGameMetaSchema = z.looseObject({
  // Translatable: title + description + story + 16 text_* strings.
  // Each accepts both legacy string and new `Localized<string>` record.
  title: LocalizedStringSchema.optional(),
  description: LocalizedStringSchema.optional(),
  story: LocalizedStringSchema.optional(),
  background_image: z.string().optional(),
  game_visual: z.string().optional(),
  top_1_image: z.string().optional(),
  top_3_image: z.string().optional(),
  top_10_image: z.string().optional(),
  top_1_sound: z.string().optional(),
  top_3_sound: z.string().optional(),
  top_10_sound: z.string().optional(),
  final_image_sound: z.string().optional(),
  game_public: z.string().optional(),
  default_time: z.string().optional(),
  default_time_malus: z.string().optional(),
  font: z.string().optional(),
  font_color: z.string().optional(),
  level_font_color: z.string().optional(),
  scenario_version: z.string().optional(),
  levels: z.record(z.string(), LevelSchema).optional(),
  overscores: z.array(OverscoreSchema).optional(),
  team_title: z.string().optional(),
  pdf_title: z.string().optional(),
  auto_reset: z.boolean().optional(),
  delay_auto_reset: z.string().optional(),
  text_player_starts: LocalizedStringSchema.optional(),
  text_card_not_empty: LocalizedStringSchema.optional(),
  text_team_starts_card_not_empty: LocalizedStringSchema.optional(),
  text_card_not_corresponding: LocalizedStringSchema.optional(),
  text_team_ended: LocalizedStringSchema.optional(),
  text_all_team_ended: LocalizedStringSchema.optional(),
  text_scenario_ended: LocalizedStringSchema.optional(),
  text_team_reached_new_level: LocalizedStringSchema.optional(),
  text_card_empty: LocalizedStringSchema.optional(),
  text_late_malus: LocalizedStringSchema.optional(),
  text_team_enters_top_ranking: LocalizedStringSchema.optional(),
  text_team_enters_podium: LocalizedStringSchema.optional(),
  text_team_first_place: LocalizedStringSchema.optional(),
  text_following_top_podium: LocalizedStringSchema.optional(),
  text_if_error: LocalizedStringSchema.optional(),
  text_is_card_empty: LocalizedStringSchema.optional(),
  message_display_time: z.string().optional(),
  animation_display_time: z.string().optional(),
  animation_image_duration: z.string().optional(),
  animation_message_duration: z.string().optional(),
  custom_fonts: z.array(CustomFontSchema).optional(),
});

export const MysteryGameMetaSchema = BaseGameMetaSchema.extend({
  enigmas: z.array(EnigmaSchema).optional(),
  number_of_enigmas: z.string().optional(),
  overscore_steps: z.string().optional(),
  score_full_game: z.string().optional(),
  animation_enigma_duration: z.string().optional(),
  gauge_filling: z.string().optional(),
  game_instructions_image: z.string().optional(),
  game_instructions_button_image: z.string().optional(),
  game_instructions_button_hover_image: z.string().optional(),
  game_refresh_button_image: z.string().optional(),
  game_refresh_button_hover_image: z.string().optional(),
  levels_gauge_image: z.string().optional(),
  levels_gauge_image_with_content: z.string().optional(),
  levels_gauge_player_icon_image: z.string().optional(),
  levels_gauge_level_icon_image: z.string().optional(),
  time_background_image: z.string().optional(),
  score_background_image: z.string().optional(),
  enigmas_header_image: z.string().optional(),
  steps_container_image: z.string().optional(),
  enigma_success: z.string().optional(),
  enigma_error: z.string().optional(),
  enigma_no_answer: z.string().optional(),
  points_units: z.string().optional(),
});

export const TagquestGameMetaSchema = BaseGameMetaSchema.extend({
  quests: z.array(QuestSchema).optional(),
  end_station: z.string().optional(),
  malus_points: z.string().optional(),
  malus_station_number: z.string().optional(),
  late_malus_points: z.string().optional(),
  combo_2_quests: z.string().optional(),
  combo_4_quests: z.string().optional(),
  combo_6_quests: z.string().optional(),
  malus_image: z.string().optional(),
  late_malus_image: z.string().optional(),
  custom_template: z.string().optional(),
  use_default_template: z.boolean().optional(),
  success_sound: z.string().optional(),
  cheating_sound: z.string().optional(),
  malus_sound: z.string().optional(),
  late_malus_sound: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* Top-level scenarios.data wrapper                                           */
/*                                                                            */
/* Slice 3C: strict — extra top-level keys log as drift. The legacy           */
/* `translations` envelope is GONE; per-field `Localized<string>` maps live   */
/* inline in `game_meta`. The PHP migration converted all rows; the           */
/* `playground.php` compat layer synthesizes the legacy envelope on the way   */
/* out for the Tauri 2 playground.                                            */
/* -------------------------------------------------------------------------- */

export const MysteryScenarioDataSchema = z.strictObject({
  game_meta: MysteryGameMetaSchema,
  default_language: z.string(),
  available_languages: z.array(z.string()),
});

export const TagquestScenarioDataSchema = z.strictObject({
  game_meta: TagquestGameMetaSchema,
  default_language: z.string(),
  available_languages: z.array(z.string()),
});

/* -------------------------------------------------------------------------- */
/* scenarios.medias column                                                    */
/* -------------------------------------------------------------------------- */

export const MediasSchema = z.looseObject({
  images: z.record(z.string(), z.string()),
  sounds: z.record(z.string(), z.string()),
});

/* -------------------------------------------------------------------------- */
/* Inferred TS types                                                          */
/* -------------------------------------------------------------------------- */

export type Level = z.infer<typeof LevelSchema>;
export type Overscore = z.infer<typeof OverscoreSchema>;
export type Enigma = z.infer<typeof EnigmaSchema>;
export type Quest = z.infer<typeof QuestSchema>;

export type MysteryGameMeta = z.infer<typeof MysteryGameMetaSchema>;
export type TagquestGameMeta = z.infer<typeof TagquestGameMetaSchema>;

export type MysteryScenarioData = z.infer<typeof MysteryScenarioDataSchema>;
export type TagquestScenarioData = z.infer<typeof TagquestScenarioDataSchema>;
export type ScenarioData = MysteryScenarioData | TagquestScenarioData;

export type MediasField = z.infer<typeof MediasSchema>;

/* -------------------------------------------------------------------------- */
/* Validation helper — warn-only logging for Stage 1                          */
/*                                                                            */
/* Pick the schema by row-level game_type, run safeParse, log on failure.     */
/* Always returns the original data unchanged; never blocks the save.         */
/* -------------------------------------------------------------------------- */

export type ScenarioGameType = 'mystery' | 'tagquest';

export function validateScenarioData(
  gameType: string | undefined,
  data: unknown,
  context: { scenarioId?: string | number; uniqid?: string } = {},
): void {
  let schema;
  if (gameType === 'mystery') {
    schema = MysteryScenarioDataSchema;
  } else if (gameType === 'tagquest') {
    schema = TagquestScenarioDataSchema;
  } else {
    return;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    console.error('[scenario-validation]', {
      gameType,
      ...context,
      issues: result.error.issues,
    });
  }
}

export function validateScenarioMedias(
  medias: unknown,
  context: { scenarioId?: string | number; uniqid?: string } = {},
): void {
  const result = MediasSchema.safeParse(medias);
  if (!result.success) {
    console.error('[scenario-validation] medias', {
      ...context,
      issues: result.error.issues,
    });
  }
}
