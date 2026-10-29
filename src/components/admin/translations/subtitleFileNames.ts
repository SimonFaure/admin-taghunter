/**
 * Recognise which scenario and which language a subtitle file belongs to,
 * from its file name (and, for the language, the WebVTT header as a fallback).
 *
 * Pure - no I/O. The import preview shows every guess with dropdowns, so a
 * wrong or missing guess is corrected by hand rather than silently applied.
 *
 * The export writes `<title-slug>__<uniqid>.<lang>.vtt`, which round-trips
 * exactly. Hand-named files are matched best-effort:
 *   scenario : the uniqid anywhere in the name, else the title (slugified)
 *   language : the LAST name token that is a code (`fr`, `en-US`, `pt_BR`) or a
 *              language name in English, its own language or French
 *              (`english`, `français`, `anglais`), else `Language: xx` in the
 *              file header (YouTube / Premiere exports write it).
 */

import { LANGUAGES, SUPPORTED_LANGS, type Lang } from '../../../i18n/languages';

export interface SubtitleScenarioRef {
  uniqid: string;
  title: string;
}

export interface SubtitleGuess {
  uniqid: string | null;
  lang: Lang | null;
  /** How the scenario was found, shown in the preview. */
  scenarioBy: 'uniqid' | 'title' | null;
  langBy: 'name' | 'header' | null;
}

export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** French names, since the operators name files in French. */
const FRENCH_NAMES: Record<Lang, string[]> = {
  en: ['anglais'],
  fr: ['francais'],
  es: ['espagnol'],
  de: ['allemand'],
  it: ['italien'],
  pt: ['portugais'],
  nl: ['neerlandais', 'hollandais'],
  pl: ['polonais'],
  ru: ['russe'],
  ja: ['japonais'],
  zh: ['chinois'],
  ar: ['arabe'],
};

/** Every word (slugified) that designates a language. */
const LANG_WORDS: Map<string, Lang> = (() => {
  const m = new Map<string, Lang>();
  for (const code of SUPPORTED_LANGS) {
    m.set(code, code);
    m.set(slugify(LANGUAGES[code].englishName), code);
    const native = slugify(LANGUAGES[code].nativeName);
    if (native) m.set(native, code);
    for (const w of FRENCH_NAMES[code]) m.set(w, code);
  }
  // Common 3-letter codes (ISO 639-2) seen in subtitle tooling.
  const iso3: Record<string, Lang> = {
    eng: 'en', fra: 'fr', fre: 'fr', spa: 'es', deu: 'de', ger: 'de', ita: 'it',
    por: 'pt', nld: 'nl', dut: 'nl', pol: 'pl', rus: 'ru', jpn: 'ja', zho: 'zh', chi: 'zh', ara: 'ar',
  };
  for (const [k, v] of Object.entries(iso3)) m.set(k, v);
  return m;
})();

const SUBTITLE_EXT_RE = /\.(vtt|srt)$/i;

function stem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(SUBTITLE_EXT_RE, '');
}

/** Language from the file name, scanning tokens right to left. */
export function langFromName(fileName: string): Lang | null {
  const tokens = slugify(stem(fileName)).split('-').filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const hit = LANG_WORDS.get(tokens[i]);
    if (hit) return hit;
  }
  return null;
}

/** `Language: fr` (or `fr-FR`) in the header block, before the first cue. */
export function langFromHeader(text: string): Lang | null {
  const header = text.split(/\r?\n\r?\n/)[0] ?? '';
  const m = header.match(/^\s*Language\s*:\s*([A-Za-z]{2,3})/im);
  return m ? (LANG_WORDS.get(m[1].toLowerCase()) ?? null) : null;
}

export function scenarioFromName(
  fileName: string,
  scenarios: SubtitleScenarioRef[],
): { uniqid: string; by: 'uniqid' | 'title' } | null {
  const raw = stem(fileName).toLowerCase();
  const byId = scenarios.find((s) => s.uniqid && raw.includes(s.uniqid.toLowerCase()));
  if (byId) return { uniqid: byId.uniqid, by: 'uniqid' };

  // Title: drop the language tokens so "mission-antidote-en" matches
  // "Mission Antidote", then exact slug, else the longest title contained in
  // the name. Ambiguity (two titles equally long) is not resolved.
  const fullSlug = slugify(stem(fileName));
  const tokens = fullSlug.split('-').filter(Boolean);
  const nameSlug = tokens.filter((t) => !LANG_WORDS.has(t)).join('-');
  if (!fullSlug) return null;

  // A title may itself hold a language word ("English Garden"), hence both.
  const exact = scenarios.filter((s) => {
    const slug = slugify(s.title);
    return slug === nameSlug || slug === fullSlug;
  });
  if (exact.length === 1) return { uniqid: exact[0].uniqid, by: 'title' };

  const contained = scenarios
    .map((s) => ({ s, slug: slugify(s.title) }))
    .filter(({ slug }) => slug.length >= 3 && `-${fullSlug}-`.includes(`-${slug}-`))
    .sort((a, b) => b.slug.length - a.slug.length);
  if (contained.length === 0) {
    // The other way round: the name is a shortened title ("ile aux tresors"
    // for "L'Île aux Trésors"). Only when exactly one title fits.
    if (nameSlug.length < 5) return null;
    const within = scenarios.filter((s) => `-${slugify(s.title)}-`.includes(`-${nameSlug}-`));
    return within.length === 1 ? { uniqid: within[0].uniqid, by: 'title' } : null;
  }
  if (contained.length > 1 && contained[0].slug.length === contained[1].slug.length) return null;
  return { uniqid: contained[0].s.uniqid, by: 'title' };
}

export function guessSubtitle(
  fileName: string,
  text: string,
  scenarios: SubtitleScenarioRef[],
): SubtitleGuess {
  const sc = scenarioFromName(fileName, scenarios);
  const nameLang = langFromName(fileName);
  const headerLang = nameLang ? null : langFromHeader(text);
  return {
    uniqid: sc?.uniqid ?? null,
    scenarioBy: sc?.by ?? null,
    lang: nameLang ?? headerLang,
    langBy: nameLang ? 'name' : headerLang ? 'header' : null,
  };
}

export const isSubtitleFileName = (name: string): boolean => SUBTITLE_EXT_RE.test(name);

/**
 * Normalise to WebVTT. `.vtt` passes through (BOM kept out); `.srt` gets the
 * signature and its `00:00:01,000` timestamps rewritten to `00:00:01.000`.
 * Returns null when the content is neither.
 */
export function toWebVtt(fileName: string, text: string): string | null {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.startsWith('WEBVTT')) return body;
  if (!/\.srt$/i.test(fileName)) return null;
  if (!/\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(body)) return null;
  const cues = body
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${cues}\n`;
}
