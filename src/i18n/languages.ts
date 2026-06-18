/**
 * Canonical language registry for the whole app.
 *
 * Single source of truth for *which* languages exist, their display names, and
 * their text direction. The code set (`SUPPORTED_LANGS` / `Lang`) is re-exported
 * from the scenario-authoring i18n module so chrome (bucket 1), in-game shared
 * text (bucket 2), and scenario content (bucket 3) all agree on the same 12 codes.
 *
 * Design: plan `multilingual-app-translator-workflow.md`.
 *
 * - `CHROME_LANGS` is the operator-facing subset the UI chrome actually ships
 *   today. It starts small (fr/en) and grows on demand (es next) so we don't pay
 *   to translate ~1000 chrome strings into languages no operator uses. In-game /
 *   scenario text targets the full `SUPPORTED_LANGS` player-facing set.
 * - `dir` is registry-ready now; full chrome RTL is deferred, but player-facing
 *   rendering uses it when a team's language is RTL.
 * - `en` is the pivot/source language; `fr` is the default display language.
 */

import { SUPPORTED_LANGS, type Lang } from '../scenarios/i18n/types';

export { SUPPORTED_LANGS };
export type { Lang };

export interface LanguageMeta {
  /** ISO code, matches `Lang`. */
  code: Lang;
  /** Endonym shown in pickers (e.g. "Français"). */
  nativeName: string;
  /** English name for admin/debug surfaces. */
  englishName: string;
  /** Text direction. Only `ar` is `rtl` today. */
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: Record<Lang, LanguageMeta> = {
  en: { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  fr: { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr' },
  es: { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr' },
  de: { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr' },
  it: { code: 'it', nativeName: 'Italiano', englishName: 'Italian', dir: 'ltr' },
  pt: { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr' },
  nl: { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', dir: 'ltr' },
  pl: { code: 'pl', nativeName: 'Polski', englishName: 'Polish', dir: 'ltr' },
  ru: { code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr' },
  ja: { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr' },
  zh: { code: 'zh', nativeName: '中文', englishName: 'Chinese', dir: 'ltr' },
  ar: { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl' },
};

/** The pivot/source language all translations are authored from. */
export const PIVOT_LANG: Lang = 'en';

/** The default display language before any user/browser preference applies. */
export const DEFAULT_DISPLAY_LANG: Lang = 'fr';

/**
 * The operator-facing subset chrome ships today. Grow this (add `'es'`, …) as
 * markets come online and the corresponding chrome XLSX is translated + imported.
 */
export const CHROME_LANGS: readonly Lang[] = ['fr', 'en'] as const;

/**
 * The languages a *client* can pick as their account language (drives their
 * Studio UI language + seeds playground onboarding + scenario defaults).
 * Superset of `CHROME_LANGS` by `es`: a client may select Spanish even though
 * the operator chrome switcher doesn't offer it yet. Until the `es` chrome
 * catalogs land (Phase 2), an `es` client resolves keys via the `en` pivot.
 * Design: project_client_language.
 */
export const CLIENT_LANGS: readonly Lang[] = ['fr', 'en', 'es'] as const;

/** Type guard: is `code` one of the canonical languages? */
export function isLang(code: string): code is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(code);
}

/** Text direction for a language code, defaulting to ltr for unknowns. */
export function dirOf(code: string): 'ltr' | 'rtl' {
  return isLang(code) ? LANGUAGES[code].dir : 'ltr';
}
