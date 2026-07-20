import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

// Files whose user-facing chrome has been migrated to i18next (`t()`). The
// no-literal-string guard runs ONLY on these so the migration can't regress.
// As more studio surfaces are swept, add them here. Deferred (still English):
// the internal admin console (Dashboard staff views), scenario preview
// *renderers* (bucket-2 in-game mirror), and dev/admin tools.
const I18N_GUARDED = [
  // Scenario editor bodies (all game-type config sections) — swept 2026-07-13.
  'src/scenarios/bodies/**/*.tsx',
  // Scenario editor preview modals + shell chrome.
  'src/scenarios/preview/MysteryIngameLayoutModal.tsx',
  'src/scenarios/preview/MysteryPreviewModal.tsx',
  'src/scenarios/preview/TagquestPreviewModal.tsx',
  'src/scenarios/preview/ViewportSelect.tsx',
  'src/scenarios/shell/components/SectionsTOC.tsx',
  'src/scenarios/shell/components/CollapsibleSection.tsx',
  'src/scenarios/shell/components/UniversTagInput.tsx',
  'src/scenarios/shell/components/AssetUploadField.tsx',
  // Client-facing views.
  'src/components/client/GameConfigView.tsx',
  'src/components/client/StationSelect.tsx',
  'src/components/client/MyQrCodesView.tsx',
  'src/components/go/GoStatisticsView.tsx',
  'src/components/go/GoClientsView.tsx',
];

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // i18n regression guard — only the migrated chrome files. `jsx-text-only`
  // checks visible JSX text nodes (not attributes/args), matching the
  // playground guard. Brand/product tokens are allow-listed.
  {
    files: I18N_GUARDED,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          framework: 'react',
          words: {
            exclude: [
              '[0-9!-/:-@[-`{-~]+',
              '[A-Z_-]+',
              /^\p{Emoji}+$/u,
              /^[^\p{L}]+$/u,
              // Brand / product nouns kept verbatim.
              'Tag Hunter',
              'TagHunter',
              'GO',
              'Drop',
              'The Purge',
              'Studio',
            ],
          },
        },
      ],
    },
  }
);
