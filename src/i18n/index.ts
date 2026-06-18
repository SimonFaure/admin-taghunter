/**
 * i18next bootstrap for studio chrome (bucket 1).
 *
 * One i18next instance for the whole app. Chrome catalogs are bundled at build
 * time (the JSON under `./locales/<lang>/<namespace>.json`, loaded eagerly via
 * Vite glob). In-game shared text (bucket 2) is injected later at runtime from
 * the synced store via `i18next.addResourceBundle` — see `addIngameBundles`.
 *
 * Design: plan `multilingual-app-translator-workflow.md`.
 * - `{{var}}` interpolation + CLDR plurals (i18next defaults).
 * - Fallback chain: requested → `en` (pivot) → raw key.
 * - Only the operator-facing `CHROME_LANGS` subset is selectable for chrome.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  CHROME_LANGS,
  CLIENT_LANGS,
  DEFAULT_DISPLAY_LANG,
  PIVOT_LANG,
  dirOf,
  isLang,
  type Lang,
} from './languages';

const UI_LANG_STORAGE_KEY = 'taghunter_ui_lang';

// Eagerly bundle every chrome catalog. Keys look like
// './locales/en/common.json'; we split out <lang> and <namespace>.
const catalogModules = import.meta.glob<Record<string, unknown>>(
  './locales/*/*.json',
  { eager: true, import: 'default' },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
const namespaceSet = new Set<string>();

for (const [filePath, content] of Object.entries(catalogModules)) {
  const match = filePath.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  namespaceSet.add(ns);
  (resources[lang] ??= {})[ns] = content;
}

export const CHROME_NAMESPACES = Array.from(namespaceSet).sort();

/** Resolve the initial chrome language: stored pref → browser → default. */
function resolveInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(UI_LANG_STORAGE_KEY);
    if (stored && isLang(stored) && CHROME_LANGS.includes(stored)) return stored;
  } catch {
    /* localStorage may be unavailable; fall through */
  }
  const browser = (typeof navigator !== 'undefined' ? navigator.language : '')
    .split('-')[0];
  if (isLang(browser) && CHROME_LANGS.includes(browser)) return browser;
  return DEFAULT_DISPLAY_LANG;
}

/** Reflect the active language onto <html lang/dir> for a11y + RTL readiness. */
function applyDocumentLang(lang: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirOf(lang);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLang(),
  fallbackLng: PIVOT_LANG,
  // Clients can run the UI in `es` even though chrome only ships fr/en catalogs
  // today; `es` is allowed here so i18next accepts the switch and resolves keys
  // via the `en` pivot fallback until the es catalogs land (Phase 2).
  supportedLngs: [...CLIENT_LANGS],
  ns: CHROME_NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  // Surface the raw key in dev when a translation is missing; never send to a
  // backend (offline-first, and bucket 1 is dev-owned).
  saveMissing: false,
  debug: import.meta.env.DEV,
});

applyDocumentLang(i18n.language);
i18n.on('languageChanged', applyDocumentLang);

/** Change + persist the chrome language. Ignores languages outside the subset. */
export function setUiLanguage(lang: Lang): void {
  if (!CHROME_LANGS.includes(lang)) return;
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore persistence failure */
  }
}

/**
 * Apply a *client's* account language to the running UI and persist it as the
 * stored display language. Unlike `setUiLanguage`, this accepts the full
 * `CLIENT_LANGS` set (incl. `es`) since a client's choice is not gated by the
 * operator chrome switcher. Call on client login/restore. Design:
 * project_client_language.
 */
export function applyClientLanguage(lang: string): void {
  if (!isLang(lang) || !CLIENT_LANGS.includes(lang)) return;
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore persistence failure */
  }
}

export default i18n;
