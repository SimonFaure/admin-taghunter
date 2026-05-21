/**
 * Text strings section — the 16 `text_*` UI strings, each a `Localized<string>`.
 *
 * Slice 3B: converted to LocalizedField; per-string per-language editing.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { useScenarioEditor } from '../useScenarioEditor';
import { LocalizedField } from '../components/LocalizedField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import type { Localized } from '../../i18n/types';

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

export function TextStringsSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="UI text strings">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TEXT_KEYS.map((key) => (
          <LocalizedField
            key={key}
            label={prettyKey(key)}
            value={meta[key] as Localized<string> | string | undefined}
            onChange={(next) =>
              editor.setGameMeta(
                (m) => ({ ...(m as Record<string, unknown>), [key]: next }) as typeof m,
              )
            }
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function prettyKey(k: string): string {
  return k.replace(/^text_/, '').replace(/_/g, ' ');
}
