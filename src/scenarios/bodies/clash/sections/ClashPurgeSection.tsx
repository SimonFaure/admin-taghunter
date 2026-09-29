/**
 * "The Purge" section - the purge station number, the purge marker image and
 * the game-wide purge sound.
 *
 * The media fields are OPTIONAL with no publish gate, but there is deliberately
 * no built-in fallback image: a scenario without a purge image has the purge
 * feature disabled in the playground launch modal. The image doubles as the
 * on-map target marker (positioned per territory in the Layout editor) and the
 * ranking-panel purge token.
 *
 * The station moved here from launch-only in retours #50: it defaulted to 25
 * with nothing in the editor saying so, so authors kept handing balise 25 to a
 * territory and only found the clash at launch (where it silently disables the
 * purge). Authored here, the territory picker greys it out and publish
 * validation refuses the collision.
 *
 * It is PICKED from the client's si_balises inventory (same design as the malus
 * balise in the other editors), not typed: a free number field let an author
 * enter a station they don't own, or one a territory already uses, with nothing
 * to tell them until launch.
 *
 * Design: project_clash_purge_feature (grill-me decision record).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks } from 'lucide-react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { LocalizedField } from '../../../shell/components/LocalizedField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized } from '../../../i18n/getLocalized';
import type { Lang, Localized } from '../../../i18n/types';
import { clashPurgeSlots } from '../mediaSlots';
import { DEFAULT_CLASH_PURGE_STATION } from '../defaults';
import { useStationInventory } from '../useClashStations';
import { PurgeStationPickerModal } from './PurgeStationPickerModal';
import type { ClashTerritory } from '../../../../types/scenario-data';

/**
 * The purge's own wording (retours sept. #68). The announcement sentence is the
 * existing `event_text_purge` (also used by the bottom banner, so the two can
 * never disagree); the three refusal messages are new. Blank ⇒ the app default
 * in the launch language. Authors need them to handle singular/plural clan
 * names, or to re-theme the purge entirely.
 */
const PURGE_TEXT_KEYS = [
  'event_text_purge',
  'purge_text_already_used',
  'purge_text_own_territory',
  'purge_text_no_target',
] as const;

export function ClashPurgeSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  function setField(key: string, value: unknown) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);
  }

  const rawStation = Number(meta.purge_station ?? DEFAULT_CLASH_PURGE_STATION);
  const station = Number.isFinite(rawStation) && rawStation > 0 ? rawStation : DEFAULT_CLASH_PURGE_STATION;
  const territories = (meta.territories ?? []) as ClashTerritory[];
  // Live collision readout - publish validation refuses this too, but the
  // author should see it without opening the picker.
  const collidingIndex = territories.findIndex((terr) => (terr.balises ?? []).includes(station));

  // Inventory fetched on the first picker open, then reused.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const { stations, loading, error, loaded } = useStationInventory(everOpened);

  function territoryLabel(terr: ClashTerritory, idx: number): string {
    return (
      getLocalized(terr.name as never, lang, defaultLang) ||
      t('editorClash:territories.territoryLabel', { number: idx + 1 })
    );
  }

  // Station number -> the territory using it. Those can never be the purge
  // station: one punch cannot both validate a territory and fire the purge.
  const usedBy = useMemo(() => {
    const map = new Map<number, string>();
    territories.forEach((terr, i) => {
      const label = territoryLabel(terr, i);
      (terr.balises ?? []).forEach((n) => {
        if (!map.has(n)) map.set(n, label);
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territories, lang, defaultLang, t]);

  // Only meaningful once the inventory is in: before that we can't tell an
  // unknown station from an unloaded one.
  const unknownStation = loaded && !stations.some((s) => Number((s.station_name ?? '').trim()) === station);

  return (
    <>
      <CollapsibleSection title={t('editorClash:purge.title')}>
        <p className="text-xs text-gray-500 mb-3">
          {t('editorClash:purge.hint')}
        </p>

        <div className="mb-4">
          <span className="block text-xs font-medium text-gray-700 mb-1">
            {t('editorClash:purge.stationLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-full text-sm font-mono font-semibold ${
                collidingIndex >= 0
                  ? 'bg-red-50 text-red-700'
                  : unknownStation
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-blue-50 text-blue-700'
              }`}
            >
              {station}
            </span>
            <button
              type="button"
              onClick={() => {
                setEverOpened(true);
                setPickerOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50"
            >
              <ListChecks className="w-3.5 h-3.5" /> {t('editorClash:purge.chooseStation')}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('editorClash:purge.stationHint')}</p>
          {collidingIndex >= 0 && (
            <p className="text-xs text-red-600 mt-1">
              {t('editorClash:purge.stationCollision', {
                station,
                number: collidingIndex + 1,
              })}
            </p>
          )}
          {unknownStation && collidingIndex < 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {t('editorClash:purge.stationUnknown', { station })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clashPurgeSlots.map((slot) => (
            <AssetUploadField
              key={slot.key}
              slot={slot}
              value={String(meta[slot.key] ?? '')}
              onChange={(filename) => setField(slot.key, filename)}
            />
          ))}
        </div>
        <p className="text-xs text-amber-600 mt-3">
          {t('editorClash:purge.warning')}
        </p>

        <div className="mt-4">
          <span className="block text-xs font-medium text-gray-700 mb-1">
            {t('editorClash:purge.textsTitle')}
          </span>
          <p className="text-xs text-gray-500 mb-2">{t('editorClash:purge.textsHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PURGE_TEXT_KEYS.map((key) => (
              <div key={key}>
                <LocalizedField
                  label={t(`editorClash:purge.texts.${key}.label`)}
                  value={meta[key] as Localized<string> | string | undefined}
                  onChange={(next) => setField(key, next)}
                  placeholder={t(`editorClash:purge.texts.${key}.placeholder`)}
                />
                <p className="mt-1 text-xs text-gray-500">{t(`editorClash:purge.texts.${key}.when`)}</p>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {pickerOpen && (
        <PurgeStationPickerModal
          stations={stations}
          loading={loading}
          error={error}
          selected={station}
          usedBy={usedBy}
          onConfirm={(next) => setField('purge_station', next)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
