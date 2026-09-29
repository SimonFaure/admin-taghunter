/**
 * Read/write a `Localized<string>` inside `game_meta` by path.
 *
 * PATH GRAMMAR - the contract the grid, the CSV/XLSX round-trip and the PHP
 * write endpoint all obey:
 *
 *   <scalar>                        "title" | "text_if_error" | "ranking_title"
 *   <collection>/<segment>/<field>  "levels/1/name" | "enigmas/1/text"
 *                                   "text_elements/te_ab12/text"
 *   univers/<ordinal>               "univers/1"  (1-based)
 *
 * Segment resolution, driven by `CollectionSpec` - never by a heuristic:
 *
 *   levels                         keyed record -> the record key verbatim
 *   enigmas/quests/overscores      array        -> 1-BASED ordinal (positional)
 *   checkpoints/clans/territories/ array + id   -> the item's `id`, with a
 *   text_elements                                 1-based ordinal fallback
 *
 * `univers` is special: the tag itself stays a plain string in
 * `game_meta.univers` (it is the canonical identity every filter matches on)
 * and only its label is localized, in the `game_meta.univers_i18n` sibling map
 * keyed by that tag. See `src/types/univers.ts`.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import type { Lang } from './types';
import type { Localized } from './types';
import { setLocalized } from './getLocalized';
import { COLLECTIONS_BY_GAME_TYPE, type CollectionSpec } from './translatablePaths';
import { UNIVERS_I18N_KEY } from '../../types/univers';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every collection spec across all game types, keyed by collection name. */
const SPEC_BY_KEY: Record<string, CollectionSpec> = (() => {
  const out: Record<string, CollectionSpec> = {};
  for (const specs of Object.values(COLLECTIONS_BY_GAME_TYPE)) {
    for (const spec of specs) out[spec.key] = spec;
  }
  return out;
})();

/** Locate an array item by `id`, falling back to a 1-based ordinal. */
function indexOfSegment(list: unknown[], spec: CollectionSpec, segment: string): number {
  if (spec.idProp) {
    const byId = list.findIndex(
      (item) => isRecord(item) && item[spec.idProp!] === segment,
    );
    if (byId >= 0) return byId;
  }
  const ordinal = Number(segment);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > list.length) return -1;
  return ordinal - 1;
}

/**
 * Read the raw value at `path`. Returns `undefined` when the path does not
 * resolve (e.g. it points at an enigma that has since been deleted) - callers
 * must treat that as "skip", never as "create".
 */
export function getAtPath(
  gameMeta: unknown,
  path: string,
): Localized<string> | string | undefined {
  const meta = isRecord(gameMeta) ? gameMeta : undefined;
  if (!meta) return undefined;
  const segments = path.split('/');

  if (segments.length === 1) {
    const v = meta[segments[0]];
    return typeof v === 'string' || isRecord(v) ? (v as Localized<string> | string) : undefined;
  }

  // univers/<ordinal> -> the localized LABEL map for that canonical tag.
  if (segments.length === 2 && segments[0] === 'univers') {
    const tag = universTagAt(meta, segments[1]);
    if (tag === undefined) return undefined;
    const labels = meta[UNIVERS_I18N_KEY];
    if (!isRecord(labels)) return undefined;
    const entry = labels[tag];
    return isRecord(entry) ? (entry as Localized<string>) : undefined;
  }

  if (segments.length !== 3) return undefined;
  const [collection, segment, field] = segments;
  const spec = SPEC_BY_KEY[collection];
  if (!spec) return undefined;

  const container = meta[collection];
  let item: unknown;
  if (spec.container === 'record') {
    if (!isRecord(container)) return undefined;
    item = container[segment];
  } else {
    if (!Array.isArray(container)) return undefined;
    const i = indexOfSegment(container, spec, segment);
    if (i < 0) return undefined;
    item = container[i];
  }
  if (!isRecord(item)) return undefined;
  const v = item[field];
  return typeof v === 'string' || isRecord(v) ? (v as Localized<string> | string) : undefined;
}

/** The canonical univers tag at a 1-based ordinal, or undefined. */
export function universTagAt(
  gameMeta: Record<string, unknown>,
  ordinalSegment: string,
): string | undefined {
  const list = Array.isArray(gameMeta.univers)
    ? gameMeta.univers.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  const ordinal = Number(ordinalSegment);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > list.length) return undefined;
  return list[ordinal - 1];
}

/**
 * Immutably set one language of the `Localized<string>` at `path`.
 *
 * Returns the ORIGINAL object unchanged when the path does not resolve, so a
 * stale path (a deleted enigma, a renamed univers tag) is a no-op rather than
 * resurrecting a ghost item. Callers detect this by identity (`next === prev`).
 */
export function setAtPath<T extends Record<string, unknown>>(
  gameMeta: T,
  path: string,
  lang: Lang,
  value: string,
  defaultLang: Lang,
): T {
  const segments = path.split('/');

  if (segments.length === 1) {
    const key = segments[0];
    if (!(key in gameMeta)) {
      // A never-authored scalar is legitimate to create - unlike a collection
      // item, there is no ambiguity about what it refers to.
      return { ...gameMeta, [key]: setLocalized(undefined, lang, value, defaultLang) };
    }
    const current = gameMeta[key];
    if (typeof current !== 'string' && !isRecord(current)) return gameMeta;
    return {
      ...gameMeta,
      [key]: setLocalized(current as Localized<string> | string, lang, value, defaultLang),
    };
  }

  if (segments.length === 2 && segments[0] === 'univers') {
    const tag = universTagAt(gameMeta, segments[1]);
    if (tag === undefined) return gameMeta;
    const labels = isRecord(gameMeta[UNIVERS_I18N_KEY])
      ? (gameMeta[UNIVERS_I18N_KEY] as Record<string, unknown>)
      : {};
    const entry = isRecord(labels[tag]) ? (labels[tag] as Localized<string>) : undefined;
    return {
      ...gameMeta,
      [UNIVERS_I18N_KEY]: {
        ...labels,
        [tag]: setLocalized(entry, lang, value, defaultLang),
      },
    };
  }

  if (segments.length !== 3) return gameMeta;
  const [collection, segment, field] = segments;
  const spec = SPEC_BY_KEY[collection];
  if (!spec) return gameMeta;

  const container = gameMeta[collection];

  if (spec.container === 'record') {
    if (!isRecord(container)) return gameMeta;
    const item = container[segment];
    if (!isRecord(item)) return gameMeta;
    return {
      ...gameMeta,
      [collection]: {
        ...container,
        [segment]: {
          ...item,
          [field]: setLocalized(
            item[field] as Localized<string> | string | undefined,
            lang,
            value,
            defaultLang,
          ),
        },
      },
    };
  }

  if (!Array.isArray(container)) return gameMeta;
  const i = indexOfSegment(container, spec, segment);
  if (i < 0) return gameMeta;
  const item = container[i];
  if (!isRecord(item)) return gameMeta;

  const nextList = container.slice();
  nextList[i] = {
    ...item,
    [field]: setLocalized(
      item[field] as Localized<string> | string | undefined,
      lang,
      value,
      defaultLang,
    ),
  };
  return { ...gameMeta, [collection]: nextList };
}
