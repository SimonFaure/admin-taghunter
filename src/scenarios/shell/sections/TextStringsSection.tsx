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

const TEXT_KEYS = [
  'text_player_starts',
  'text_card_not_empty',
  'text_team_starts_card_not_empty',
  'text_card_not_corresponding',
  'text_team_ended',
  'text_all_team_ended',
  'text_scenario_ended',
  'text_team_reached_new_level',
  'text_card_empty',
  'text_late_malus',
  'text_team_enters_top_ranking',
  'text_team_enters_podium',
  'text_team_first_place',
  'text_following_top_podium',
  'text_if_error',
  'text_is_card_empty',
] as const;

// TagQuest only surfaces this focused subset of UI strings.
const TAGQUEST_TEXT_KEYS = [
  'text_card_empty',
  'text_team_cheating',
  'text_team_ended',
  'text_if_error',
] as const;

// Mystery doesn't surface ranking/podium/level UI strings.
const MYSTERY_OMITTED_KEYS = new Set<string>([
  'text_scenario_ended',
  'text_team_enters_top_ranking',
  'text_team_first_place',
  'text_card_not_empty',
  'text_team_reached_new_level',
  'text_team_enters_podium',
  'text_following_top_podium',
  'text_is_card_empty',
]);
const MYSTERY_TEXT_KEYS = TEXT_KEYS.filter((k) => !MYSTERY_OMITTED_KEYS.has(k));

// Tracks shows ranking/podium via images and has no levels/late-malus text, so
// it omits those UI strings; what remains are the operational run messages the
// tracks runtime actually surfaces (start, card states, end, error).
const TRACKS_OMITTED_KEYS = new Set<string>([
  'text_card_not_empty',
  'text_all_team_ended',
  'text_team_reached_new_level',
  'text_late_malus',
  'text_team_enters_top_ranking',
  'text_team_enters_podium',
  'text_team_first_place',
  'text_following_top_podium',
  'text_is_card_empty',
]);
const TRACKS_TEXT_KEYS = TEXT_KEYS.filter((k) => !TRACKS_OMITTED_KEYS.has(k));

// Retours #55 - Clash surfaces NONE of these strings. Every player-facing word
// in a Clash game comes from the app's `ingame_clash` translations (status
// messages, registration, results) or from the scenario's own event-banner
// texts (ClashEventTextsSection). The section listed 16 fields that could never
// fire, which is exactly what the retour reported ("aucun n'est apparu"), so
// Clash gets no UI-strings section at all.
const CLASH_TEXT_KEYS: readonly string[] = [];

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
