/**
 * Text strings section - the 16 `text_*` UI strings, each a `Localized<string>`.
 *
 * Slice 3B: converted to LocalizedField; per-string per-language editing.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../useScenarioEditor';
import { LocalizedField } from '../components/LocalizedField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import type { Localized } from '../../i18n/types';
import { HelpDot } from '../../../help';

// The key lists moved to the translatable-path registry, which is now the
// single source of truth for "what is translatable" - the Translations page
// builds its scenario grid from the same data, so the two cannot drift.
import {
  TEXT_KEYS,
  TAGQUEST_TEXT_KEYS,
  MYSTERY_TEXT_KEYS,
  TRACKS_TEXT_KEYS,
  CLASH_TEXT_KEYS,
} from '../../i18n/translatablePaths';

export function TextStringsSection() {
  const { t } = useTranslation('editorSections3');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const keys: readonly string[] =
    editor.gameType === 'tagquest'
      ? TAGQUEST_TEXT_KEYS
      : editor.gameType === 'mystery'
        ? MYSTERY_TEXT_KEYS
        : editor.gameType === 'tracks'
          ? TRACKS_TEXT_KEYS
          : editor.gameType === 'clash'
            ? CLASH_TEXT_KEYS
            : TEXT_KEYS;

  if (keys.length === 0) return null;

  return (
    <CollapsibleSection title={t('textStrings.title')} headerExtra={<HelpDot topic="editor.translations" />}>
      <p className="mb-3 text-sm text-amber-300/90">
        {t('textStrings.placeholderHint')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {keys.map((key) => {
          // Retours #5/#6 - the labels alone didn't say WHICH situation fires a
          // given message ("puce vide": really blank, or not wiped? and "erreur":
          // which error?). A hint spells out the trigger and gives an example.
          // Keys with no authored hint render nothing (defaultValue '').
          const hint = t(`textStrings.hints.${key}`, { defaultValue: '' });
          return (
            <div key={key}>
              <LocalizedField
                label={t(`textStrings.labels.${key}`)}
                value={meta[key] as Localized<string> | string | undefined}
                onChange={(next) =>
                  editor.setGameMeta(
                    (m) => ({ ...(m as Record<string, unknown>), [key]: next }) as typeof m,
                  )
                }
              />
              {hint && (
                <p className="mt-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">{t('textStrings.hintsTitle')}</span>{' '}
                  {hint}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
