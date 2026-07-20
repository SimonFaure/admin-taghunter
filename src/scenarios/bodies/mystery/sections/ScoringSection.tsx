/**
 * Scoring section - number_of_enigmas, score_full_game, points_units.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

// Free-text numeric fields. `points_units` is a radio pair (see below) - it must
// be one of the two canonical values the playground reads (`points` / `percentage`).
const TEXT_KEYS = ['number_of_enigmas', 'score_full_game'] as const;

// Signed maluses (default 0; negative = penalty, positive = bonus). Applied once
// per enigma in the matching outcome state. See plan
// mystery-both-answers-no-answer-malus-images.md.
const MALUS_FIELDS = (t: TFunction) =>
  [
    { key: 'malus_both_answers_biped', label: t('editorMystery:scoring.malusBothAnswers') },
    { key: 'malus_no_answer', label: t('editorMystery:scoring.malusNoAnswer') },
  ] as const;

// Canonical points-unit values + their labels. These exact values are what the
// playground / preview compare against (`points_units === 'percentage'`).
const POINTS_UNITS_OPTIONS = (t: TFunction) =>
  [
    { value: 'points', label: t('editorMystery:scoring.unitPts') },
    { value: 'percentage', label: t('editorMystery:scoring.unitPercent') },
  ] as const;

// Localized labels for the free-text numeric fields (replaces the old prettyKey).
const TEXT_KEY_LABELS: Record<(typeof TEXT_KEYS)[number], string> = {
  number_of_enigmas: 'editorMystery:scoring.numberOfEnigmas',
  score_full_game: 'editorMystery:scoring.scoreFullGame',
};

export function ScoringSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  // Empty / legacy-blank defaults to 'points' (the playground's read fallback).
  const pointsUnits = String(meta.points_units ?? '') || 'points';

  return (
    <CollapsibleSection title={t('editorMystery:scoring.title')}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {TEXT_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{t(TEXT_KEY_LABELS[key])}</span>
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

        {MALUS_FIELDS(t).map(({ key, label }) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{label}</span>
            <input
              type="text"
              inputMode="numeric"
              value={String(meta[key] ?? '')}
              placeholder="0"
              onChange={(e) =>
                editor.setGameMeta(
                  (m) => ({ ...(m as Record<string, unknown>), [key]: e.target.value }) as typeof m,
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
        ))}

        <div className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">{t('editorMystery:scoring.pointsUnits')}</span>
          <div className="flex items-center gap-4 pt-1.5">
            {POINTS_UNITS_OPTIONS(t).map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="points_units"
                  value={opt.value}
                  checked={pointsUnits === opt.value}
                  onChange={() =>
                    editor.setGameMeta(
                      (m) => ({ ...(m as Record<string, unknown>), points_units: opt.value }) as typeof m,
                    )
                  }
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
