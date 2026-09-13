/**
 * Pattern section - picks the default tagquest pattern (each quest's 4 piece
 * images → station/balise assignments) this scenario uses. Stored as
 * `scenario_default_pattern` (the pattern's uniqid).
 *
 * The selected pattern's per-image station correspondences are surfaced next to
 * each quest's image fields in the Quests section below
 * (see useTagquestPatternStations).
 *
 * Duplicate guard: a pattern whose stations include the scenario's malus
 * station (`game_meta.malus_station`) cannot be applied - a single physical
 * punch cannot both complete a quest slot and cost malus points. The selection
 * is refused with a one-click "drop the malus station and apply" fix; the
 * mirror guard (disabling pattern stations in the malus picker) lives in
 * MalusComboSection.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { db } from '../../../../creator-ported/lib/db';
import { useTagquestPatternStationIds } from '../useTagquestStations';

interface TagquestPatternOption {
  pattern_uniqid: string;
  name: string;
  status?: string | null;
}

export function PatternSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const value = (meta.scenario_default_pattern as string | null | undefined) ?? '';
  const malusStation = (meta.malus_station as number | null | undefined) ?? null;
  const [patterns, setPatterns] = useState<TagquestPatternOption[]>([]);
  // A selection refused because it would collide with the malus station.
  const [refused, setRefused] = useState<{ uniqid: string; name: string } | null>(null);
  const stationIdsByPattern = useTagquestPatternStationIds();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('patterns')
        .select('pattern_uniqid, name, status')
        .eq('game_type', 'tagquest');
      if (!cancelled && Array.isArray(data)) {
        setPatterns((data as TagquestPatternOption[]).filter((p) => !!p.pattern_uniqid));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function collides(uniqid: string): boolean {
    if (!uniqid || malusStation == null) return false;
    return stationIdsByPattern.get(uniqid)?.has(malusStation) ?? false;
  }

  function applyPattern(v: string) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          scenario_default_pattern: v === '' ? null : v,
        }) as typeof m,
    );
  }

  function setValue(v: string) {
    setRefused(null);
    if (collides(v)) {
      // Don't apply: the <select> is controlled by `value`, so it snaps back.
      setRefused({ uniqid: v, name: patterns.find((p) => p.pattern_uniqid === v)?.name ?? v });
      return;
    }
    applyPattern(v);
  }

  function clearMalusAndApply() {
    if (!refused) return;
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          malus_station: null,
          scenario_default_pattern: refused.uniqid === '' ? null : refused.uniqid,
        }) as typeof m,
    );
    setRefused(null);
  }

  const knownSelected = patterns.some((p) => p.pattern_uniqid === value);
  // Already-stored conflict (imported / hand-edited data, or a pattern edited
  // after the fact to use the malus station).
  const currentCollides = collides(value);

  return (
    <CollapsibleSection title={t('editorTagquest:pattern.sectionTitle')}>
      <label className="block">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorTagquest:pattern.label')}
        </span>
        <select
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          className={`w-full px-2 py-1.5 border rounded-md text-sm bg-white ${
            currentCollides ? 'border-red-400' : 'border-gray-300'
          }`}
        >
          <option value="">{t('editorTagquest:pattern.none')}</option>
          {patterns.map((p) => (
            <option key={p.pattern_uniqid} value={p.pattern_uniqid}>
              {p.name}
              {p.status && p.status !== 'published' ? ` (${p.status})` : ''}
              {collides(p.pattern_uniqid) ? ` ${t('editorTagquest:pattern.collidesSuffix')}` : ''}
            </option>
          ))}
          {value && !knownSelected && (
            <option value={value}>{t('editorTagquest:pattern.notFoundOption', { value })}</option>
          )}
        </select>
        <span className="text-xs text-gray-500 block mt-1">
          {t('editorTagquest:pattern.hint')}
        </span>
      </label>

      {(refused || currentCollides) && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>
              {refused
                ? t('editorTagquest:pattern.collisionRefused', {
                    pattern: refused.name,
                    id: malusStation,
                  })
                : t('editorTagquest:pattern.collisionCurrent', { id: malusStation })}
            </p>
            <button
              type="button"
              onClick={
                refused
                  ? clearMalusAndApply
                  : () =>
                      editor.setGameMeta(
                        (m) => ({ ...(m as Record<string, unknown>), malus_station: null }) as typeof m,
                      )
              }
              className="mt-1 underline font-medium hover:text-red-900"
            >
              {refused
                ? t('editorTagquest:pattern.collisionFixAndApply')
                : t('editorTagquest:pattern.collisionFix')}
            </button>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
