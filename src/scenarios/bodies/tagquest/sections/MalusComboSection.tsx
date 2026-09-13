/**
 * Malus / combo section - malus_points, late_malus_points, combo_2/4/6_quests,
 * plus the malus STATION: the trap balise whose every punch costs
 * `malus_points` in the playground (see tagquestPunchLogic).
 *
 * The malus station is stored as an `si_balises.id` in `game_meta.malus_station`
 * and must never be one of the selected pattern's quest stations - the picker
 * disables those, and a legacy/imported conflict is surfaced here in red with a
 * one-click fix (the mirror guard lives in PatternSection).
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, MapPin } from 'lucide-react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useTagquestPatternStations } from '../useTagquestPatternStations';
import { useStationInventory } from '../useTagquestStations';
import { MalusStationPickerModal } from './MalusStationPickerModal';

const MALUS_KEYS = ['malus_points', 'late_malus_points'] as const;
const COMBO_KEYS = ['combo_2_quests', 'combo_4_quests', 'combo_6_quests'] as const;

export function MalusComboSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const [pickerOpen, setPickerOpen] = useState(false);

  const malusStation = (meta.malus_station as number | null | undefined) ?? null;
  const patternUniqid = (meta.scenario_default_pattern as string | null | undefined) ?? null;
  const questStations = useTagquestPatternStations(patternUniqid);
  // Also fetched when a station is already set, so the button can name it
  // without the author having to open the picker first.
  const { stations, loading, error } = useStationInventory(pickerOpen || malusStation != null);

  // Every station id the selected pattern assigns to a quest slot.
  const patternStationIds = useMemo(() => {
    const out = new Set<number>();
    for (const slots of questStations) {
      for (const s of Object.values(slots)) {
        if (s.stationId != null) out.add(s.stationId);
      }
    }
    return out;
  }, [questStations]);

  const conflicts = malusStation != null && patternStationIds.has(malusStation);
  const stationLabel = stations.find((s) => s.id === malusStation)?.station_name ?? null;

  function setMalusStation(id: number | null) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), malus_station: id }) as typeof m);
  }

  const field = (key: string) => (
    <label key={key} className="block">
      <span className="text-xs font-medium text-gray-700 mb-1 block">{t(`editorTagquest:malusCombo.keys.${key}`)}</span>
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
  );

  return (
    <CollapsibleSection title={t('editorTagquest:malusCombo.sectionTitle')}>
      <div className="grid grid-cols-2 gap-3">
        {MALUS_KEYS.map(field)}
      </div>

      {/* Malus station - the balise that costs points on every punch. */}
      <div className="mt-3">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorTagquest:malusStation.label')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              conflicts
                ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100'
                : malusStation != null
                  ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
            }`}
          >
            <MapPin className="w-4 h-4 flex-shrink-0" />
            {malusStation == null
              ? t('editorTagquest:malusStation.none')
              : t('editorTagquest:malusStation.selected', {
                  id: malusStation,
                  name: stationLabel ?? '',
                })}
          </button>
          {malusStation != null && (
            <button
              type="button"
              onClick={() => setMalusStation(null)}
              className="text-xs text-gray-500 hover:text-red-600 underline"
            >
              {t('editorTagquest:malusStation.clear')}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500 block mt-1">
          {t('editorTagquest:malusStation.hint')}
        </span>
      </div>

      {conflicts && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>{t('editorTagquest:malusStation.conflict', { id: malusStation })}</p>
            <button
              type="button"
              onClick={() => setMalusStation(null)}
              className="mt-1 underline font-medium hover:text-red-900"
            >
              {t('editorTagquest:malusStation.conflictFix')}
            </button>
          </div>
        </div>
      )}

      {/* Combo thresholds on their own single line. */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        {COMBO_KEYS.map(field)}
      </div>

      {pickerOpen && (
        <MalusStationPickerModal
          stations={stations}
          loading={loading}
          error={error}
          selected={malusStation}
          patternStationIds={patternStationIds}
          onConfirm={setMalusStation}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </CollapsibleSection>
  );
}
