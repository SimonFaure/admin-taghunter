/**
 * Runtime helpers for `Localized<T>`. Pure functions; no React, no state.
 *
 * Stage 3 Slice 3A. Used by Slice 3B's `<LocalizedField>` component and the
 * shell's load + save logic. Stage 3A keeps these unused as scaffolding.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import type { Lang, Localized } from './types';
import { SUPPORTED_LANGS, isLocalized } from './types';

/**
 * Read the value for `lang` out of a localized map, with fallback chain:
 *   1. exact match `loc[lang]` (even if empty string — empty means
 *      'explicitly cleared', not 'fall back')
 *   2. `loc[defaultLang]`
 *   3. first available lang with a non-undefined value
 *   4. empty string
 *
 * If `loc` is a plain string (legacy data), treats it as the source-lang
 * value: returns it for `lang === defaultLang`, otherwise returns ''.
 *
 * If `loc` is undefined / null, returns ''.
 */
export function getLocalized<T extends string = string>(
  loc: Localized<T> | T | undefined | null,
  lang: Lang,
  defaultLang: Lang,
): T | '' {
  if (loc == null) return '';

  if (typeof loc === 'string') {
    return (lang === defaultLang ? loc : '') as T | '';
  }

  if (Object.prototype.hasOwnProperty.call(loc, lang)) {
    return (loc[lang] ?? '') as T | '';
  }
  if (Object.prototype.hasOwnProperty.call(loc, defaultLang)) {
    return (loc[defaultLang] ?? '') as T | '';
  }
  for (const candidate of SUPPORTED_LANGS) {
    if (Object.prototype.hasOwnProperty.call(loc, candidate)) {
      const v = loc[candidate];
      if (v !== undefined) return v as T;
    }
  }
  return '';
}

/**
 * Immutably set the value for `lang`. Coerces a plain-string `loc` to a
 * Localized map first (treating the existing string as the source-lang
 * value, anchored at `defaultLang`).
 */
export function setLocalized<T extends string = string>(
  loc: Localized<T> | T | undefined | null,
  lang: Lang,
  value: T,
  defaultLang: Lang = 'en',
): Localized<T> {
  let base: Localized<T>;
  if (loc == null) {
    base = {};
  } else if (typeof loc === 'string') {
    base = { [defaultLang]: loc } as Localized<T>;
  } else {
    base = loc;
  }
  return { ...base, [lang]: value };
}

/**
 * Languages that have an entry (any value, including empty string) in `loc`.
 */
export function availableLangs(loc: Localized<unknown> | string | undefined | null): Lang[] {
  if (loc == null) return [];
  if (typeof loc === 'string') return [];
  return SUPPORTED_LANGS.filter((l) => Object.prototype.hasOwnProperty.call(loc, l));
}

/**
 * Coerce any value into a Localized<string> map, anchoring legacy plain
 * strings at `defaultLang`. Useful when migrating legacy fields in memory.
 */
export function toLocalized(
  value: unknown,
  defaultLang: Lang,
): Localized<string> {
  if (value == null) return {};
  if (typeof value === 'string') return { [defaultLang]: value };
  if (isLocalized<string>(value)) return value;
  return {};
}
