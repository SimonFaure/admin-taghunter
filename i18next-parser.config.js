/**
 * i18next-parser config for chrome (bucket 1) key extraction.
 *
 * Run during the audience-prioritized migration sweep to harvest t('ns:key')
 * calls into the per-namespace catalogs. English is the pivot/source; `en`
 * values are seeded from the key (default), French + others stay empty until
 * the XLSX round-trip fills them.
 *
 * Usage: npx i18next-parser  (config auto-detected)
 * Design: plan `multilingual-app-translator-workflow.md`.
 */
export default {
  locales: ['en', 'fr'],
  defaultNamespace: 'common',
  // Matches the bootstrap's Vite glob: src/i18n/locales/<lang>/<ns>.json
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{ts,tsx}'],
  // Keep human + translator edits: never drop keys that are still in catalogs
  // but momentarily unreferenced, and don't reformat untouched values.
  keepRemoved: false,
  sort: true,
  createOldCatalogs: false,
  // English source lives in the value, so seed missing en values with the key's
  // default (the literal passed to t) and leave other locales blank.
  defaultValue: (locale, _ns, key, value) =>
    locale === 'en' ? (value ?? '') : '',
  keySeparator: '.',
  namespaceSeparator: ':',
  verbose: false,
};
