/**
 * Synthesize the legacy `translations[lang] = {full copy}` envelope from a
 * gameMeta where translatable fields are now `Localized<string>` maps.
 *
 * Used by:
 *   - `buildZipPayload` in adapters (back-compat ZIP shape until consumers
 *     are updated)
 *   - `playground.php` compat layer (PHP equivalent - keep them in sync)
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import type { Capabilities } from '../types';
import type { Lang } from './types';
import { getLocalized } from './getLocalized';

interface LegacyTranslationEntry {
  title?: string;
  description?: string;
  story?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  levels?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quests?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enigmas?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overscores?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkpoints?: any[];
}

/**
 * For each available language, build the legacy entry by reading every
 * translatable field's Localized map at that lang (with fallback to default).
 */
export function synthesizeLegacyTranslations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameMeta: any,
  capabilities: Capabilities,
  availableLanguages: string[],
  defaultLanguage: string,
): Record<string, LegacyTranslationEntry> {
  const out: Record<string, LegacyTranslationEntry> = {};
  const dl = defaultLanguage as Lang;

  for (const langCode of availableLanguages) {
    const lang = langCode as Lang;
    const entry: LegacyTranslationEntry = {
      title: getLocalized(gameMeta?.title, lang, dl),
      description: getLocalized(gameMeta?.description, lang, dl),
      story: getLocalized(gameMeta?.story, lang, dl),
    };

    if (capabilities.hasTranslatableArrays.includes('levels') && gameMeta?.levels) {
      const flatLevels: Record<string, unknown> = {};
      for (const [k, level] of Object.entries(gameMeta.levels as Record<string, Record<string, unknown>>)) {
        flatLevels[k] = {
          ...level,
          name: getLocalized(level.name as never, lang, dl),
          description: getLocalized(level.description as never, lang, dl),
        };
      }
      entry.levels = flatLevels;
    }

    if (capabilities.hasTranslatableArrays.includes('quests') && Array.isArray(gameMeta?.quests)) {
      entry.quests = (gameMeta.quests as Array<Record<string, unknown>>).map((q, i) => ({
        index: String(i),
        name: getLocalized(q.name as never, lang, dl),
      }));
    }

    if (capabilities.hasTranslatableArrays.includes('enigmas') && Array.isArray(gameMeta?.enigmas)) {
      entry.enigmas = (gameMeta.enigmas as Array<Record<string, unknown>>).map((e) => ({
        ...e,
        text: getLocalized(e.text as never, lang, dl),
      }));
    }

    if (capabilities.hasTranslatableArrays.includes('overscores') && Array.isArray(gameMeta?.overscores)) {
      entry.overscores = (gameMeta.overscores as Array<Record<string, unknown>>).map((o) => ({
        overscore_step: o.overscore_step,
        name_overscore_step: getLocalized(o.name_overscore_step as never, lang, dl),
      }));
    }

    if (capabilities.hasTranslatableArrays.includes('checkpoints') && Array.isArray(gameMeta?.checkpoints)) {
      entry.checkpoints = (gameMeta.checkpoints as Array<Record<string, unknown>>).map((c) => ({
        ...c,
        title: getLocalized(c.title as never, lang, dl),
        description: getLocalized(c.description as never, lang, dl),
      }));
    }

    out[langCode] = entry;
  }

  return out;
}

/**
 * Flatten a single Localized field to its source-language value. Used by
 * adapters that emit a "compat" ZIP whose game_data has plain-string values.
 */
export function flattenToDefault<T extends string = string>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  defaultLang: string,
): T | '' {
  return getLocalized<T>(value, defaultLang as Lang, defaultLang as Lang);
}
