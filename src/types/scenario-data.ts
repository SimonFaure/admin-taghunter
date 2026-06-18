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
  wrong_answer_image: z.string().optional(),
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
  // Name-pool tier (mini_kids/kids/ado_adultes), kept as a derived shadow of
  // `audience_bands` (written on save). Legacy source of truth for team-name
  // pools, ZIP import and storefront patterns.
  game_public: z.string().optional(),
  // New source of truth for audience: an array of fine-grained age bands
  // (age_4_5 … age_adultes). See types/audience.ts.
  audience_bands: z.array(z.string()).optional(),
  // Free-text univers/theme tags (folksonomy). See types/univers.ts.
  univers: z.array(z.string()).optional(),
  // Difficulty is now an integer 1–5 (stars). Accept number or legacy
  // enum-string ("easy"/"medium"/"hard") for un-backfilled rows; coerced on read.
  difficulty: z.union([z.number(), z.string()]).optional(),
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
  // Per-scenario mission-report PDF layout override (block-layout document).
  // Absent ⇒ playground uses the synced per-game-type default. Edited in the
  // scenario editor's "Report layout" section; shape mirrors lib/api ReportLayout.
  report_layout: z.any().optional(),
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
  // Shown when a team is caught cheating (e.g. presenting an un-erased chip).
  text_team_cheating: LocalizedStringSchema.optional(),
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

  // Default mystery pattern (each enigma's good/wrong answer image → station).
  // Stored as the pattern's uniqid; overridable at launch. See PatternSection.
  scenario_default_pattern: z.string().nullable().optional(),
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
/* Tracks (legacy `maximus`) — checkpoint-based course gameplay.              */
/*                                                                            */
/* Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md       */
/*                                                                            */
/* Checkpoints, routes, displays, play_modes, and score_types are NESTED      */
/* shapes that diverge from the flat-string-bag convention of mystery/        */
/* tagquest because they carry orthogonal multi-toggle state.                 */
/* -------------------------------------------------------------------------- */

const ToggleSchema = z.looseObject({ enabled: z.boolean() });
const ToggleWithDefaultSchema = z.looseObject({
  enabled: z.boolean(),
  default: z.boolean(),
});

export const CheckpointSchema = z.looseObject({
  id: z.string(),
  title: LocalizedStringSchema.optional(),
  description: LocalizedStringSchema.optional(),
  image: z.string().optional(),
  position: z
    .looseObject({ top: z.number(), left: z.number() })
    .optional(),
  points: z.number().optional(),
});

/**
 * Authored text labels overlaid on the tracks map at runtime.
 *
 * Plans: tracks-text-elements.md (slices 1-3) +
 *        tracks-text-elements-categories.md (categories + typography move)
 *
 * Content + (optional) position live here; style is RESOLVED at runtime via
 * the inheritance chain `element.<f>` → `category.<f>` (when `category` set
 * and matches an entry in `game_meta.text_categories`) → scenario default.
 * The element's typography fields are interpreted as per-field OVERRIDES
 * over the resolved category typography.
 *
 * `category` references `text_categories[i].id`; absent = "Uncategorized"
 * (no category in the chain). `position` absent = "authored but not placed
 * yet"; the runtime skips those.
 */
export const TextElementSchema = z.looseObject({
  id: z.string(),
  text: LocalizedStringSchema.optional(),
  /** Category id reference; undefined = Uncategorized. */
  category: z.string().optional(),
  font: z.string().optional(),
  font_color: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  shadow: z.boolean().optional(),
  background: z.boolean().optional(),
  position: z
    .looseObject({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

/**
 * Per-category typography defaults. Every field independently optional — an
 * unset field falls back to the scenario default at resolution time.
 *
 * Plan: C:\Users\faure\.claude\plans\tracks-text-elements-categories.md
 */
export const TextCategoryTypographySchema = z.looseObject({
  font: z.string().optional(),
  font_color: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  shadow: z.boolean().optional(),
  background: z.boolean().optional(),
});

/**
 * Author-defined text-element category — first-class object with id + name +
 * typography defaults. Elements reference by `id` so renames don't break refs.
 *
 * Plan: C:\Users\faure\.claude\plans\tracks-text-elements-categories.md
 */
export const TextCategorySchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  typography: TextCategoryTypographySchema.optional(),
});

export const TracksGameMetaSchema = BaseGameMetaSchema.extend({
  // Map background
  map_image: z.string().optional(),

  // HUD frame images (renderered by the layout editor; positions live in
  // scenarios.scenario_layout, NOT here)
  team_name_background_image: z.string().optional(),
  timer_background_image: z.string().optional(),
  score_background_image: z.string().optional(),
  time_background_image: z.string().optional(),

  // Feedback cue images (legacy maximus wrong_order_image / absent_image).
  // Shown full-screen at scoring time: a wrong-order break in itinerary mode,
  // and a run that reached no checkpoints.
  wrong_order_image: z.string().optional(),
  missing_checkpoint_image: z.string().optional(),

  // Checkpoints array
  checkpoints: z.array(CheckpointSchema).optional(),

  // Checkpoint icon mode: 0 = per-checkpoint (each row carries its own image),
  // 1 = common (single icon shared across all checkpoints, stored in
  // `checkpoints_unique_image_id`). Stored as boolean here (was 0/1 in legacy).
  checkpoints_unique_image: z.boolean().optional(),
  checkpoints_unique_image_id: z.string().optional(),
  checkpoint_image_width_percentage: z.string().optional(),

  // Routes (parcours) — 5 fixed presets, multi-enable at scenario level.
  // Legacy key renames: half_first → first_half, half_last → last_half,
  // half_one_out_of_two → odd, half_one_out_of_two_plus → even.
  routes: z
    .looseObject({
      default: ToggleSchema.optional(),
      first_half: ToggleSchema.optional(),
      last_half: ToggleSchema.optional(),
      odd: ToggleSchema.optional(),
      even: ToggleSchema.optional(),
    })
    .optional(),

  // Display modes — full / map / simple (operator picks one at launch from
  // the enabled set).
  displays: z
    .looseObject({
      full: ToggleSchema.optional(),
      map: ToggleSchema.optional(),
      simple: ToggleSchema.optional(),
    })
    .optional(),

  // Play modes — itinerary (ordered) vs free (any order).
  play_modes: z
    .looseObject({
      itinerary: ToggleSchema.optional(),
      free: ToggleSchema.optional(),
    })
    .optional(),

  // Score types — one is pre-selected at launch via the `default` flag.
  score_types: z
    .looseObject({
      percentage: ToggleWithDefaultSchema.optional(),
      points: ToggleWithDefaultSchema.optional(),
    })
    .optional(),

  // Display options (scenario-locked, NOT exposed at launch)
  display_score: z.boolean().optional(),
  clues_page: z
    .looseObject({
      enabled: z.boolean(),
      show_title: z.boolean(),
      show_text: z.boolean(),
      show_image: z.boolean(),
    })
    .optional(),

  // Sounds (top-level field names, like mystery's enigma_* sounds)
  checkpoint_success: z.string().optional(),
  checkpoint_error: z.string().optional(),
  checkpoint_no_answer: z.string().optional(),

  // Pattern inheritance (theme bundle: ado_adultes / kids / mini_kids).
  // Renamed from legacy `game_default_pattern`.
  scenario_default_pattern: z.string().nullable().optional(),

  // Authored text overlays placed on the map via the LayoutEditor.
  // See TextElementSchema above.
  text_elements: z.array(TextElementSchema).optional(),

  // Author-defined categories grouping text elements + carrying typography
  // defaults. Element style is resolved as
  //   element.<f> ?? category.<f> ?? scenario default
  // at runtime. See TextCategorySchema above.
  text_categories: z.array(TextCategorySchema).optional(),
});

/* -------------------------------------------------------------------------- */
/* Clash — TagQuest-derived clans/territories mode.                           */
/*                                                                            */
/* Design: project_clash_game_type_design (grill-me decision record).         */
/*                                                                            */
/* Fixed skeleton (v1): exactly 4 territory slots — 1 large (3 combinations), */
/* 2 medium (2 combinations each), 1 small (1 combination) — totalling 8      */
/* combinations over 24 balises. The scenario authors per-territory           */
/* name/points/complete-image and per-combination piece+main images + clans.  */
/* The balise station -> combination assignment lives in a separate Clash     */
/* PATTERN (game_type='clash'), selected/overridable at launch.               */
/* -------------------------------------------------------------------------- */

export const ClashClanSchema = z.looseObject({
  /** Stable id so launch-time name overrides + seals don't break on reorder. */
  id: z.string(),
  /** Default clan name (overridable at launch). */
  name: LocalizedStringSchema.optional(),
  /** Hex colour used for this clan's bars/highlights. */
  color: z.string().optional(),
  /** Seal/logo image filename (partitioned into medias.clans on save). */
  seal: z.string().optional(),
});

export const ClashCombinationSchema = z.looseObject({
  /** Stable id; referenced by the Clash pattern's station assignments. */
  id: z.string(),
  name: LocalizedStringSchema.optional(),
  /** The 3 balise piece images (revealed one per balise bip). */
  piece_1: z.string().optional(),
  piece_2: z.string().optional(),
  piece_3: z.string().optional(),
  /** Main combination image (shown when the 3 balises are validated). */
  main: z.string().optional(),
});

export const ClashTerritorySchema = z.looseObject({
  id: z.string(),
  name: LocalizedStringSchema.optional(),
  /** Fixes the combo count + control mode: large/medium = volume, small = last-bipper. */
  size: z.enum(['large', 'medium', 'small']),
  /** Point value awarded to the controlling clan (string like the rest of the bag). */
  points: z.string().optional(),
  /** Territory-complete image shown on full conquest (small reuses combo main). */
  complete_image: z.string().optional(),
  /** Seal anchor on the map (percent of the map box). Placed in the editor. */
  position: z.looseObject({ top: z.number(), left: z.number() }).optional(),
  /** Nested combinations (length 3/2/2/1 by size) — encodes the grouping. */
  combinations: z.array(ClashCombinationSchema).optional(),
});

export const ClashGameMetaSchema = BaseGameMetaSchema.extend({
  /** Map background image (layout-editor surface for territory seal anchors). */
  map_image: z.string().optional(),
  /** Neutral seal shown on contested/untouched territories. */
  neutral_seal: z.string().optional(),
  /** Up to 4 clans authored here; launch picks 2-4 active + name overrides. */
  clans: z.array(ClashClanSchema).optional(),
  /** Exactly 4 territory slots in the fixed skeleton. */
  territories: z.array(ClashTerritorySchema).optional(),
  /** Default Clash pattern (station->combination assignments), overridable at launch. */
  scenario_default_pattern: z.string().nullable().optional(),
  /** Authored text overlays placed on the map via the LayoutEditor (reused from tracks). */
  text_elements: z.array(TextElementSchema).optional(),
  text_categories: z.array(TextCategorySchema).optional(),
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

export const TracksScenarioDataSchema = z.strictObject({
  game_meta: TracksGameMetaSchema,
  default_language: z.string(),
  available_languages: z.array(z.string()),
});

export const ClashScenarioDataSchema = z.strictObject({
  game_meta: ClashGameMetaSchema,
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
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type TextCategoryTypography = z.infer<typeof TextCategoryTypographySchema>;
export type TextCategory = z.infer<typeof TextCategorySchema>;
export type ClashClan = z.infer<typeof ClashClanSchema>;
export type ClashCombination = z.infer<typeof ClashCombinationSchema>;
export type ClashTerritory = z.infer<typeof ClashTerritorySchema>;

export type MysteryGameMeta = z.infer<typeof MysteryGameMetaSchema>;
export type TagquestGameMeta = z.infer<typeof TagquestGameMetaSchema>;
export type TracksGameMeta = z.infer<typeof TracksGameMetaSchema>;
export type ClashGameMeta = z.infer<typeof ClashGameMetaSchema>;

export type MysteryScenarioData = z.infer<typeof MysteryScenarioDataSchema>;
export type TagquestScenarioData = z.infer<typeof TagquestScenarioDataSchema>;
export type TracksScenarioData = z.infer<typeof TracksScenarioDataSchema>;
export type ClashScenarioData = z.infer<typeof ClashScenarioDataSchema>;
export type ScenarioData = MysteryScenarioData | TagquestScenarioData | TracksScenarioData | ClashScenarioData;

export type MediasField = z.infer<typeof MediasSchema>;

/* -------------------------------------------------------------------------- */
/* Validation helper — warn-only logging for Stage 1                          */
/*                                                                            */
/* Pick the schema by row-level game_type, run safeParse, log on failure.     */
/* Always returns the original data unchanged; never blocks the save.         */
/* -------------------------------------------------------------------------- */

export type ScenarioGameType = 'mystery' | 'tagquest' | 'tracks' | 'clash';

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
  } else if (gameType === 'tracks') {
    schema = TracksScenarioDataSchema;
  } else if (gameType === 'clash') {
    schema = ClashScenarioDataSchema;
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
