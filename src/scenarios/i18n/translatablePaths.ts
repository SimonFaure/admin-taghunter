/**
 * The single source of truth for "which scenario fields are translatable".
 *
 * Before this file the answer was spread across three places that had already
 * drifted apart: `TextStringsSection.tsx` (the editor's per-game-type key
 * lists), `synthesizeLegacyTranslations.ts` (the TS legacy-envelope builder)
 * and `backend/utils/LocalizedCompat.php` (its PHP twin). This module owns the
 * lists; `TextStringsSection` now imports them, which collapses two of the
 * three copies into one.
 *
 * The PHP side deliberately does NOT get a copy of this registry. The write
 * endpoint (`backend/api/scenario_translations.php`) is purely structural: it
 * walks `game_meta` by path segments and validates the leaf name against
 * `LocalizedPath::LEAF_FIELDS`, which mirrors `TRANSLATABLE_LEAF_FIELDS` below
 * and nothing else. That flat list is the only PHP<->TS overlap.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import type { ScenarioGameType } from '../../types/scenario-data';

/* -------------------------------------------------------------------------- */
/* Scalars                                                                     */
/* -------------------------------------------------------------------------- */

/** Translatable top-level fields every game type has. */
export const COMMON_SCALARS = ['title', 'description', 'story'] as const;

/**
 * The scenario's authored "UI text strings".
 *
 * 17 keys: the 16 the editor has always listed plus `text_team_cheating`, which
 * is in the Zod schema and surfaced by tagquest but was missing from the PHP
 * compat layer's list. Kept here as the complete set; the per-game-type subsets
 * below are what the editor actually renders.
 */
export const TEXT_KEYS = [
  'text_player_starts',
  'text_card_not_empty',
  'text_team_starts_card_not_empty',
  'text_card_not_corresponding',
  'text_team_ended',
  'text_all_team_ended',
  'text_scenario_ended',
  'text_team_reached_new_level',
  'text_card_empty',
  'text_late_malus',
  'text_team_enters_top_ranking',
  'text_team_enters_podium',
  'text_team_first_place',
  'text_following_top_podium',
  'text_if_error',
  'text_is_card_empty',
] as const;

/** TagQuest only surfaces this focused subset of UI strings. */
export const TAGQUEST_TEXT_KEYS = [
  'text_card_empty',
  'text_team_cheating',
  'text_team_ended',
  'text_if_error',
] as const;

/** Mystery doesn't surface ranking/podium/level UI strings. */
export const MYSTERY_OMITTED_KEYS = new Set<string>([
  'text_scenario_ended',
  'text_team_enters_top_ranking',
  'text_team_first_place',
  'text_card_not_empty',
  'text_team_reached_new_level',
  'text_team_enters_podium',
  'text_following_top_podium',
  'text_is_card_empty',
]);
export const MYSTERY_TEXT_KEYS = TEXT_KEYS.filter((k) => !MYSTERY_OMITTED_KEYS.has(k));

/**
 * Tracks shows ranking/podium via images and has no levels/late-malus text, so
 * it omits those UI strings; what remains are the operational run messages the
 * tracks runtime actually surfaces (start, card states, end, error).
 */
export const TRACKS_OMITTED_KEYS = new Set<string>([
  'text_card_not_empty',
  'text_all_team_ended',
  'text_team_reached_new_level',
  'text_late_malus',
  'text_team_enters_top_ranking',
  'text_team_enters_podium',
  'text_team_first_place',
  'text_following_top_podium',
  'text_is_card_empty',
]);
export const TRACKS_TEXT_KEYS = TEXT_KEYS.filter((k) => !TRACKS_OMITTED_KEYS.has(k));

/**
 * Retours #55 - Clash surfaces NONE of these strings. Every player-facing word
 * in a Clash game comes from the app's `ingame_clash` translations or from the
 * scenario's own event-banner texts (CLASH_SCALARS below).
 */
export const CLASH_TEXT_KEYS: readonly string[] = [];

export const TEXT_KEYS_BY_GAME_TYPE: Record<ScenarioGameType, readonly string[]> = {
  mystery: MYSTERY_TEXT_KEYS,
  tagquest: TAGQUEST_TEXT_KEYS,
  tracks: TRACKS_TEXT_KEYS,
  clash: CLASH_TEXT_KEYS,
};

/** Clash's event-banner texts + ranking heading, all `Localized<string>`. */
export const CLASH_SCALARS = [
  'event_text_conquest',
  'event_text_attack',
  'event_text_neutralized',
  'event_text_purge',
  'ranking_title',
  // Purge refusal messages (retours sept. #68).
  'purge_text_already_used',
  'purge_text_own_territory',
  'purge_text_no_target',
] as const;

/* -------------------------------------------------------------------------- */
/* Collections                                                                 */
/* -------------------------------------------------------------------------- */

export type CollectionKey =
  | 'levels'
  | 'enigmas'
  | 'quests'
  | 'overscores'
  | 'checkpoints'
  | 'clans'
  | 'territories'
  | 'text_elements';

export interface CollectionSpec {
  key: CollectionKey;
  /**
   * `levels` is a keyed RECORD (`{"1": {...}}`) - its path segment is the
   * record key verbatim. Everything else is an array; see `idProp`.
   */
  container: 'record' | 'array';
  /**
   * When the item type carries a stable `id` (checkpoints, clans, territories,
   * text_elements), the path segment is that id, so a reorder cannot retarget a
   * translation. Collections without one fall back to a 1-BASED ordinal, which
   * is positional - see the note on `expandTranslatablePaths`.
   */
  idProp?: 'id';
  fields: readonly string[];
  /** Singular noun used to build a row label, e.g. "Level 1 - Name". */
  label: string;
}

const LEVELS: CollectionSpec = {
  key: 'levels',
  container: 'record',
  fields: ['name', 'description'],
  label: 'Level',
};
const ENIGMAS: CollectionSpec = {
  key: 'enigmas',
  container: 'array',
  fields: ['text', 'spot_question'],
  label: 'Enigma',
};
const QUESTS: CollectionSpec = {
  key: 'quests',
  container: 'array',
  fields: ['name'],
  label: 'Quest',
};
const OVERSCORES: CollectionSpec = {
  key: 'overscores',
  container: 'array',
  fields: ['name_overscore_step'],
  label: 'Overscore',
};
const CHECKPOINTS: CollectionSpec = {
  key: 'checkpoints',
  container: 'array',
  idProp: 'id',
  fields: ['title', 'description'],
  label: 'Checkpoint',
};
const CLANS: CollectionSpec = {
  key: 'clans',
  container: 'array',
  idProp: 'id',
  fields: ['name'],
  label: 'Clan',
};
const TERRITORIES: CollectionSpec = {
  key: 'territories',
  container: 'array',
  idProp: 'id',
  fields: ['name'],
  label: 'Territory',
};
const TEXT_ELEMENTS: CollectionSpec = {
  key: 'text_elements',
  container: 'array',
  idProp: 'id',
  fields: ['text'],
  label: 'Text element',
};

/**
 * Note this intentionally differs from each adapter's `hasTranslatableArrays`.
 * That flag drives the LEGACY translations envelope the shipped playground
 * still reads, and clash's is `[]` because clash has no envelope entry - but
 * clash scenarios genuinely do have translatable clans/territories/text
 * elements. Changing the adapter flag would alter what the playground receives,
 * so the registry carries clash's collections independently.
 */
export const COLLECTIONS_BY_GAME_TYPE: Record<ScenarioGameType, readonly CollectionSpec[]> = {
  mystery: [LEVELS, ENIGMAS, OVERSCORES],
  tagquest: [LEVELS, QUESTS],
  tracks: [CHECKPOINTS, TEXT_ELEMENTS],
  clash: [CLANS, TERRITORIES, TEXT_ELEMENTS],
};

/**
 * Every leaf property name a translatable path may end in. Mirrored by
 * `LocalizedPath::LEAF_FIELDS` in PHP - keep the two in step.
 */
export const TRANSLATABLE_LEAF_FIELDS: readonly string[] = [
  ...COMMON_SCALARS,
  ...TEXT_KEYS,
  'text_team_cheating',
  ...CLASH_SCALARS,
  'name',
  'description',
  'title',
  'text',
  'spot_question',
  'name_overscore_step',
];

/* -------------------------------------------------------------------------- */
/* Expansion                                                                   */
/* -------------------------------------------------------------------------- */

export type TradType = 'field' | 'file title' | 'text';

export interface TranslatableRow {
  /** e.g. `title`, `levels/1/name`, `text_elements/te_ab12/text`, `univers/1`. */
  path: string;
  /** Human label for the grid, e.g. "Level 1 - Name". */
  label: string;
  /** Leaf property name. */
  field: string;
  collection?: CollectionKey;
  /**
   * Set on `univers/N` rows: the canonical tag, which is both the source value
   * and the key into `game_meta.univers_i18n`. See `types/univers.ts`.
   */
  universTag?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Title-case a leaf field name for display: `name_overscore_step` -> "Name overscore step". */
function fieldLabel(field: string): string {
  const spaced = field.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Expand a scenario into one row per EXISTING translatable value. Order is
 * stable and deterministic, so an export diffs cleanly between runs.
 *
 * Array collections without an `idProp` are addressed by a **1-based ordinal**
 * (`enigmas/1/text` is the first enigma), matching the reference CSV. That is
 * POSITIONAL, not stable: deleting enigma 2 re-points `enigmas/3/text` at what
 * used to be enigma 4. The export carries the source text alongside each row
 * and the import dry-run flags a source mismatch, but a spreadsheet must be
 * re-exported after the author reorders or deletes items.
 */
export function expandTranslatablePaths(
  gameType: ScenarioGameType,
  gameMeta: unknown,
): TranslatableRow[] {
  const meta = isRecord(gameMeta) ? gameMeta : {};
  const rows: TranslatableRow[] = [];

  for (const key of COMMON_SCALARS) {
    rows.push({ path: key, label: fieldLabel(key), field: key });
  }

  // univers: the canonical tag stays a plain string in `game_meta.univers`;
  // only its LABEL is translated, in the `univers_i18n` sibling map.
  const univers = Array.isArray(meta.univers)
    ? meta.univers.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  univers.forEach((tag, i) => {
    rows.push({
      path: `univers/${i + 1}`,
      label: `Univers - ${tag}`,
      field: 'univers',
      universTag: tag,
    });
  });

  for (const key of TEXT_KEYS_BY_GAME_TYPE[gameType] ?? TEXT_KEYS) {
    rows.push({ path: key, label: fieldLabel(key), field: key });
  }

  if (gameType === 'clash') {
    for (const key of CLASH_SCALARS) {
      rows.push({ path: key, label: fieldLabel(key), field: key });
    }
  }

  for (const spec of COLLECTIONS_BY_GAME_TYPE[gameType] ?? []) {
    const raw = meta[spec.key];

    if (spec.container === 'record') {
      if (!isRecord(raw)) continue;
      for (const recordKey of Object.keys(raw)) {
        const item = raw[recordKey];
        if (!isRecord(item)) continue;
        for (const field of spec.fields) {
          rows.push({
            path: `${spec.key}/${recordKey}/${field}`,
            label: `${spec.label} ${recordKey} - ${fieldLabel(field)}`,
            field,
            collection: spec.key,
          });
        }
      }
      continue;
    }

    if (!Array.isArray(raw)) continue;
    raw.forEach((item, index) => {
      if (!isRecord(item)) return;
      const id = spec.idProp ? item[spec.idProp] : undefined;
      const segment = typeof id === 'string' && id !== '' ? id : String(index + 1);
      for (const field of spec.fields) {
        // Only emit a row for a field the item can actually carry. `enigmas`
        // lists `spot_question`, which exists only on Spot-adaptable scenarios.
        if (!(field in item)) continue;
        rows.push({
          path: `${spec.key}/${segment}/${field}`,
          label: `${spec.label} ${index + 1} - ${fieldLabel(field)}`,
          field,
          collection: spec.key,
        });
      }
    });
  }

  return rows;
}
