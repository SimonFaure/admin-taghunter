/**
 * Territories section (V2) - a seeded, editable list of territories. Each
 * territory is one variable-size balise set (physical station codes, authored
 * inline and overridable at launch) worth pts/min ∝ balise count. No
 * combinations, no pattern. Control is strict-max validation count everywhere.
 *
 * Design: project_clash_game_type_design (V2).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { ClashTerritory } from '../../../../types/scenario-data';

const MIN_TERRITORIES = 2;
const MAX_TERRITORIES = 12;

function parseBalises(text: string): number[] {
  return text
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

interface TerritoryCardProps {
  territory: ClashTerritory;
  index: number;
  canRemove: boolean;
  lang: Lang;
  defaultLang: Lang;
  onChange: (patch: Partial<ClashTerritory>) => void;
  onRemove: () => void;
}

function TerritoryCard({ territory, index, canRemove, lang, defaultLang, onChange, onRemove }: TerritoryCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const displayName = getLocalized(territory.name as never, lang, defaultLang);
  const balises = territory.balises ?? [];

  // Keep the raw text the user is typing in local state so that commas,
  // trailing separators, and spacing are never stripped mid-keystroke by the
  // parse→store→join round-trip. We only resync the draft from the model when
  // the model's balises change to something other than what this draft encodes
  // (e.g. scenario load, undo), never on our own edits.
  const balisesText = balises.join(', ');
  const [balisesDraft, setBalisesDraft] = useState(balisesText);
  useEffect(() => {
    if (parseBalises(balisesDraft).join(',') !== balises.join(',')) {
      setBalisesDraft(balisesText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balisesText]);

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
            <input
              value={balisesDraft}
              onChange={(e) => {
                setBalisesDraft(e.target.value);
                onChange({ balises: parseBalises(e.target.value) });
              }}
              onBlur={() => setBalisesDraft(balises.join(', '))}
              placeholder={t('editorClash:territories.balisesPlaceholder')}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm font-mono"
            />
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

  return (
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
          {territories.map((t, i) => (
            <TerritoryCard
              key={t.id ?? i}
              territory={t}
              index={i}
              canRemove={territories.length > MIN_TERRITORIES}
              lang={lang}
              defaultLang={defaultLang}
              onChange={(patch) => updateTerritory(i, patch)}
              onRemove={() => removeTerritory(i)}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
