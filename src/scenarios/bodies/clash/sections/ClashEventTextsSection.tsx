/**
 * Clash event-banner texts (retours #56).
 *
 * The bottom banner of the live dashboard narrates the match ("<clan> a conquis
 * <territoire> !"). Those sentences used to come from the app translations only,
 * with no way for an author to give a scenario its own voice - the retour asked
 * for exactly that, after discovering the shell's "Textes de l'interface"
 * section does NOT drive them (Clash surfaces none of those strings, see
 * TextStringsSection / retours #55).
 *
 * Every field is optional: left blank, the runtime keeps the app's translated
 * default for the launch language. Two placeholders are substituted at render
 * time - `%CLAN%` (drawn in the clan's own colour) and `%TERRITORY%`. A text
 * with no `%CLAN%` still gets the clan name prepended, matching the default
 * wording, so a half-filled field never loses the actor.
 */

import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { LocalizedField } from '../../../shell/components/LocalizedField';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import type { Localized } from '../../../i18n/types';

/** gameMeta keys, in the order the runtime narrates them. */
const CLASH_EVENT_TEXT_KEYS = [
  'event_text_conquest',
  'event_text_attack',
  'event_text_neutralized',
  'event_text_purge',
] as const;

export function ClashEventTextsSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  const setField = (key: string, next: Localized<string>) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: next }) as typeof m);

  return (
    <CollapsibleSection title={t('editorClash:eventTexts.title')}>
      <p className="text-xs text-gray-500 mb-3">{t('editorClash:eventTexts.hint')}</p>
      <p className="text-xs text-amber-600 mb-3">{t('editorClash:eventTexts.placeholderHint')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CLASH_EVENT_TEXT_KEYS.map((key) => (
          <div key={key}>
            <LocalizedField
              label={t(`editorClash:eventTexts.labels.${key}`)}
              value={meta[key] as Localized<string> | string | undefined}
              onChange={(next) => setField(key, next)}
              placeholder={t(`editorClash:eventTexts.placeholders.${key}`)}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t(`editorClash:eventTexts.whens.${key}`)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 max-w-md">
        <LocalizedField
          label={t('editorClash:eventTexts.labels.ranking_title')}
          value={meta.ranking_title as Localized<string> | string | undefined}
          onChange={(next) => setField('ranking_title', next)}
          placeholder={t('editorClash:eventTexts.placeholders.ranking_title')}
        />
        <p className="mt-1 text-xs text-gray-500">{t('editorClash:eventTexts.whens.ranking_title')}</p>
      </div>
    </CollapsibleSection>
  );
}
