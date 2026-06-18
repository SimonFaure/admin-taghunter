/**
 * Scoring section — number_of_enigmas, score_full_game, points_units.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

// Free-text numeric fields. `points_units` is a radio pair (see below) — it must
// be one of the two canonical values the playground reads (`points` / `percentage`).
const TEXT_KEYS = ['number_of_enigmas', 'score_full_game'] as const;

// Canonical points-unit values + their labels. These exact strings are what the
// playground / preview compare against (`points_units === 'percentage'`).
const POINTS_UNITS_OPTIONS = [
  { value: 'points', label: 'pts' },
  { value: 'percentage', label: '%' },
] as const;

export function ScoringSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  // Empty / legacy-blank defaults to 'points' (the playground's read fallback).
  const pointsUnits = String(meta.points_units ?? '') || 'points';

  return (
    <CollapsibleSection title="Scoring">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {TEXT_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{prettyKey(key)}</span>
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

        <div className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">points units</span>
          <div className="flex items-center gap-4 pt-1.5">
            {POINTS_UNITS_OPTIONS.map((opt) => (
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

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ');
}
