/**
 * Timing section - default_time, default_time_malus, message_display_time
 * (+ mystery-only animation_enigma_duration).
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';

const TIMING_KEYS = [
  'default_time',
  'default_time_malus',
  'message_display_time',
] as const;

export function TimingSection() {
  const { t } = useTranslation('editorSections1');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  // Clash has no late/time malus, so the time-malus field is irrelevant.
  // Mystery surfaces its enigma-reveal step duration here (moved out of the
  // Enigma timing & sounds section).
  const keys: readonly string[] = editor.gameType === 'clash'
    ? TIMING_KEYS.filter((k) => k !== 'default_time_malus')
    : editor.gameType === 'mystery'
      ? [...TIMING_KEYS, 'animation_enigma_duration']
      : TIMING_KEYS;

  return (
    <CollapsibleSection title={t('timing.sectionTitle')}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {keys.map((key) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{t(`timing.keys.${key}`)}</span>
            <input
              type="text"
              value={String(meta[key] ?? '')}
              onChange={(e) =>
                editor.setGameMeta(
                  (m) => ({ ...(m as Record<string, unknown>), [key]: e.target.value }) as typeof m,
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}