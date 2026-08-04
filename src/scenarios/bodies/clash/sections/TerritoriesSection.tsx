/**
 * Territories section (V2) - a seeded, editable list of territories. Each
 * territory is one variable-size balise set worth pts/min ∝ balise count,
 * picked from the client's si_balises inventory via a modal (station NUMBERS
 * are stored; the playground resolves them to station ids at launch). No
 * combinations, no pattern. Control is strict-max validation count everywhere.
 *
 * Design: project_clash_game_type_design (V2).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ListChecks, Plus, Trash2 } from 'lucide-react';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { ClashTerritory } from '../../../../types/scenario-data';
import { db } from '../../../../creator-ported/lib/db';
import { BalisePickerModal, type StationRow } from './BalisePickerModal';

const MIN_TERRITORIES = 2;
const MAX_TERRITORIES = 12;

interface TerritoryCardProps {
  territory: ClashTerritory;
  index: number;
  canRemove: boolean;
  lang: Lang;
  defaultLang: Lang;
  /** Numeric station numbers present in the inventory; null while unloaded. */
  inventoryNumbers: Set<number> | null;
  onChange: (patch: Partial<ClashTerritory>) => void;
  onOpenPicker: () => void;
  onRemove: () => void;
}

function TerritoryCard({
  territory,
  index,
  canRemove,
  lang,
  defaultLang,
  inventoryNumbers,
  onChange,
  onOpenPicker,
  onRemove,
}: TerritoryCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const displayName = getLocalized(territory.name as never, lang, defaultLang);
  const balises = territory.balises ?? [];
  const sortedBalises = [...balises].sort((a, b) => a - b);

  return (
    <div className="border border-gray-200 rounded-md bg-white">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1 hover:bg-gray-50 rounded text-gray-400"
          aria-label={expanded ? t('editorClash:territories.collapse') : t('editorClash:territories.expand')}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600 text-white font-semibold">
          {t('editorClash:territories.territoryLabel', { number: index + 1 })}
        </span>
        <span className="text-sm text-gray-900 truncate flex-1">
          {displayName || <span className="text-gray-400 italic">{t('editorClash:territories.unnamed')}</span>}
        </span>
        <span className="text-xs text-gray-500">{t('editorClash:territories.baliseCount', { count: balises.length })}</span>
        {territory.points && <span className="text-xs text-gray-500">{t('editorClash:territories.pointsPerMin', { points: territory.points })}</span>}
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1.5 hover:bg-red-50 rounded text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t('editorClash:territories.removeAria')}
          title={canRemove ? t('editorClash:territories.removeTooltip') : t('editorClash:territories.minTooltip', { count: MIN_TERRITORIES })}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('editorClash:territories.name')}</label>
              <input
                value={displayName}
                onChange={(e) =>
                  onChange({ name: setLocalized(territory.name as never, lang, e.target.value, defaultLang) })
                }
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('editorClash:territories.pointsPerMinute')}</label>
              <input
                value={territory.points ?? ''}
                onChange={(e) => onChange({ points: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {t('editorClash:territories.balisesLabel')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {sortedBalises.length === 0 ? (
                <span className="text-xs text-gray-400 italic">{t('editorClash:territories.noBalises')}</span>
              ) : (
                sortedBalises.map((n) => {
                  const unknown = inventoryNumbers !== null && !inventoryNumbers.has(n);
                  return (
                    <span
                      key={n}
                      title={unknown ? t('editorClash:territories.unknownStation') : undefined}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-mono ${
                        unknown ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {n}
                    </span>
                  );
                })
              )}
              <button
                type="button"
                onClick={onOpenPicker}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50"
              >
                <ListChecks className="w-3.5 h-3.5" /> {t('editorClash:territories.chooseBalises')}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t('editorClash:territories.balisesHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function TerritoriesSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const territories = ((editor.gameMeta as Record<string, unknown>).territories ?? []) as ClashTerritory[];

  // Station inventory - fetched lazily on first picker open, then reused for
  // every territory (and for the unknown-number chip flags).
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [stationsError, setStationsError] = useState(false);

  async function openPicker(idx: number) {
    setPickerIdx(idx);
    if (stations !== null) return;
    setStationsError(false); // a previous failure retries on reopen
    try {
      const { data, error } = await db
        .from('si_balises')
        .select('id, station_name, station_function')
        .order('id', { ascending: true });
      if (error) throw error;
      setStations((data ?? []) as StationRow[]);
    } catch (err) {
      console.error('Error loading stations:', err);
      setStationsError(true);
    }
  }

  const inventoryNumbers = useMemo(() => {
    if (!stations) return null;
    const set = new Set<number>();
    for (const s of stations) {
      const name = (s.station_name ?? '').trim();
      const num = Number(name);
      if (name !== '' && Number.isInteger(num) && num >= 0) set.add(num);
    }
    return set;
  }, [stations]);

  function territoryDisplayLabel(terr: ClashTerritory, idx: number): string {
    return (
      getLocalized(terr.name as never, lang, defaultLang) ||
      t('editorClash:territories.territoryLabel', { number: idx + 1 })
    );
  }

  // Station number -> label of the territory using it, excluding the one the
  // picker is open for (its own balises are the modal's selected set).
  const usedBy = useMemo(() => {
    const map = new Map<number, string>();
    if (pickerIdx === null) return map;
    territories.forEach((terr, i) => {
      if (i === pickerIdx) return;
      const label = territoryDisplayLabel(terr, i);
      (terr.balises ?? []).forEach((n) => {
        if (!map.has(n)) map.set(n, label);
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territories, pickerIdx, lang, defaultLang, t]);

  function setTerritories(next: ClashTerritory[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), territories: next }) as typeof m);
  }

  function updateTerritory(idx: number, patch: Partial<ClashTerritory>) {
    setTerritories(territories.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTerritory() {
    if (territories.length >= MAX_TERRITORIES) return;
    const id = `territory_${Date.now()}`;
    setTerritories([...territories, { id, name: {}, points: '1', balises: [] }]);
  }

  function removeTerritory(idx: number) {
    if (territories.length <= MIN_TERRITORIES) return;
    setTerritories(territories.filter((_, i) => i !== idx));
  }

  const atMax = territories.length >= MAX_TERRITORIES;
  const pickerTerritory = pickerIdx !== null ? territories[pickerIdx] : null;

  return (
    <>
      <CollapsibleSection
        title={t('editorClash:territories.title')}
        headerExtra={
          <button
            onClick={addTerritory}
            disabled={atMax}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title={atMax ? t('editorClash:territories.maxTooltip', { count: MAX_TERRITORIES }) : t('editorClash:territories.addTooltip')}
          >
            <Plus className="w-3 h-3" /> {t('editorClash:territories.add')}
          </button>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {t('editorClash:territories.hint')}
        </p>
        {territories.length === 0 ? (
          <p className="text-sm text-gray-500">{t('editorClash:territories.empty')}</p>
        ) : (
          <div className="space-y-2">
            {territories.map((terr, i) => (
              <TerritoryCard
                key={terr.id ?? i}
                territory={terr}
                index={i}
                canRemove={territories.length > MIN_TERRITORIES}
                lang={lang}
                defaultLang={defaultLang}
                inventoryNumbers={inventoryNumbers}
                onChange={(patch) => updateTerritory(i, patch)}
                onOpenPicker={() => void openPicker(i)}
                onRemove={() => removeTerritory(i)}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {pickerIdx !== null && pickerTerritory && (
        <BalisePickerModal
          key={pickerIdx}
          territoryLabel={territoryDisplayLabel(pickerTerritory, pickerIdx)}
          stations={stations ?? []}
          loading={stations === null && !stationsError}
          error={stationsError}
          selected={pickerTerritory.balises ?? []}
          usedBy={usedBy}
          onConfirm={(nums) => updateTerritory(pickerIdx, { balises: nums })}
          onClose={() => setPickerIdx(null)}
        />
      )}
    </>
  );
}
