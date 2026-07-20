/**
 * Score types section - Percentage / Points. Enable + choose which one is
 * the launch-modal default. Exactly one enabled type should be marked
 * default (validator warns otherwise).
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type ScoreKey = 'percentage' | 'points';

function getScoreTypes(t: TFunction): ReadonlyArray<{ key: ScoreKey; label: string; help: string }> {
  return [
    { key: 'percentage', label: t('editorTracks:scoreTypes.items.percentage.label'), help: t('editorTracks:scoreTypes.items.percentage.help') },
    { key: 'points', label: t('editorTracks:scoreTypes.items.points.label'), help: t('editorTracks:scoreTypes.items.points.help') },
  ];
}

export function ScoreTypesSection() {
  const { t } = useTranslation();
  const SCORE_TYPES = getScoreTypes(t);
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const scoreTypes = (meta.score_types ?? {}) as Record<
    ScoreKey,
    { enabled?: boolean; default?: boolean } | undefined
  >;

  function setEnabled(key: ScoreKey, enabled: boolean) {
    editor.setGameMeta((m) => {
      const cur = (m as Record<string, unknown>).score_types as Record<
        ScoreKey,
        { enabled?: boolean; default?: boolean } | undefined
      >;
      const next = { ...cur, [key]: { ...(cur?.[key] ?? {}), enabled } };
      // If we just disabled the current default, hand off "default" to the
      // other enabled key (if any) so the launch modal always has a pre-pick.
      if (!enabled && cur?.[key]?.default) {
        const otherKey: ScoreKey = key === 'percentage' ? 'points' : 'percentage';
        if (next[otherKey]?.enabled) {
          next[key] = { ...next[key], default: false };
          next[otherKey] = { ...next[otherKey], default: true };
        }
      }
      return { ...(m as Record<string, unknown>), score_types: next } as typeof m;
    });
  }

  function setDefault(key: ScoreKey) {
    editor.setGameMeta((m) => {
      const cur = (m as Record<string, unknown>).score_types as Record<
        ScoreKey,
        { enabled?: boolean; default?: boolean } | undefined
      >;
      const next: Record<string, { enabled?: boolean; default?: boolean } | undefined> = {};
      for (const k of Object.keys(cur ?? {}) as ScoreKey[]) {
        next[k] = { ...(cur[k] ?? {}), default: k === key };
      }
      return { ...(m as Record<string, unknown>), score_types: next } as typeof m;
    });
  }

  return (
    <CollapsibleSection title={t('editorTracks:scoreTypes.sectionTitle')}>
      <p className="text-xs text-gray-500 mb-3">
        {t('editorTracks:scoreTypes.hint')}
      </p>
      <div className="space-y-2">
        {SCORE_TYPES.map((s) => {
          const v = scoreTypes[s.key];
          return (
            <div key={s.key} className="flex items-start gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!v?.enabled}
                  onChange={(ev) => setEnabled(s.key, ev.target.checked)}
                />
                <span>
                  <span className="font-medium text-gray-900">{s.label}</span>
                  <span className="text-gray-500"> - {s.help}</span>
                </span>
              </label>
              <label className="inline-flex items-center gap-1 ml-auto">
                <input
                  type="radio"
                  name="score-type-default"
                  checked={!!v?.default}
                  disabled={!v?.enabled}
                  onChange={() => setDefault(s.key)}
                />
                <span className="text-xs text-gray-500">{t('editorTracks:scoreTypes.default')}</span>
              </label>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
