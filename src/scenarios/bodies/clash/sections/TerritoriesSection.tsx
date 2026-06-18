/**
 * Territories & combinations section — the fixed 4-territory skeleton
 * (large/medium/medium/small holding 8 combinations). Authors per-territory
 * name/points/complete-image and per-combination 3 piece images + main image.
 *
 * Control mode is derived from size (large/medium = volume, small =
 * last-bipper) and shown read-only. Territory structure is fixed in v1; the
 * balise station -> combination mapping lives in the Clash pattern, not here.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { ClashTerritory, ClashCombination } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';
import { clashTerritoryComboNumbers } from '../skeleton';

const SIZE_LABEL: Record<ClashTerritory['size'], string> = {
  large: 'Large',
  medium: 'Medium',
  small: 'Small',
};

const SIZE_CONTROL: Record<ClashTerritory['size'], string> = {
  large: 'Volume — clan with the most validations wins',
  medium: 'Volume — clan with the most validations wins',
  small: 'Last bipper — last clan to validate controls it',
};

const PIECE_KEYS: ReadonlyArray<{ key: 'piece_1' | 'piece_2' | 'piece_3'; label: string }> = [
  { key: 'piece_1', label: 'Balise 1' },
  { key: 'piece_2', label: 'Balise 2' },
  { key: 'piece_3', label: 'Balise 3' },
];

function makeSlot(key: string, label: string): MediaSlot {
  return { key, kind: 'image', required: false, scope: 'type', label };
}

interface CombinationCardProps {
  combination: ClashCombination;
  territoryIndex: number;
  index: number;
  lang: Lang;
  defaultLang: Lang;
  onChange: (patch: Partial<ClashCombination>) => void;
}

function CombinationCard({ combination, territoryIndex, index, lang, defaultLang, onChange }: CombinationCardProps) {
  const displayName = getLocalized(combination.name as never, lang, defaultLang);
  const piecesUploaded = PIECE_KEYS.reduce((n, p) => (combination[p.key] ? n + 1 : n), 0);
  const slotPrefix = `territory_${territoryIndex}_combo_${index}`;

  return (
    <div className="border border-gray-100 rounded-md bg-gray-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">
          Combination {clashTerritoryComboNumbers(territoryIndex)[index] ?? index + 1}
        </span>
        <span className={`text-xs ${piecesUploaded === 3 ? 'text-green-600' : 'text-gray-400'}`}>
          {piecesUploaded}/3 balises
        </span>
        <input
          value={displayName}
          placeholder="Combination name"
          onChange={(e) =>
            onChange({ name: setLocalized(combination.name as never, lang, e.target.value, defaultLang) })
          }
          className="ml-auto w-1/2 px-2 py-1 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Main image — shown when the 3 balises are validated</p>
          <AssetUploadField
            slot={makeSlot(`${slotPrefix}_main`, 'Main image')}
            value={combination.main ?? ''}
            onChange={(filename) => onChange({ main: filename })}
          />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">3 balise piece images (revealed one per bip)</p>
          <div className="grid grid-cols-3 gap-2">
            {PIECE_KEYS.map((p) => (
              <AssetUploadField
                key={p.key}
                slot={makeSlot(`${slotPrefix}_${p.key}`, p.label)}
                value={(combination[p.key] as string | undefined) ?? ''}
                onChange={(filename) => onChange({ [p.key]: filename } as Partial<ClashCombination>)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TerritoryCardProps {
  territory: ClashTerritory;
  index: number;
  lang: Lang;
  defaultLang: Lang;
  onChange: (patch: Partial<ClashTerritory>) => void;
}

function TerritoryCard({ territory, index, lang, defaultLang, onChange }: TerritoryCardProps) {
  const [expanded, setExpanded] = useState(true);
  const displayName = getLocalized(territory.name as never, lang, defaultLang);
  const combinations = territory.combinations ?? [];
  const isSmall = territory.size === 'small';

  function updateCombination(ci: number, patch: Partial<ClashCombination>) {
    onChange({
      combinations: combinations.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });
  }

  return (
    <div className="border border-gray-200 rounded-md bg-white">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1 hover:bg-gray-50 rounded text-gray-400"
          aria-label={expanded ? 'Collapse territory' : 'Expand territory'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600 text-white font-semibold">
          Territory {index + 1}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
          {SIZE_LABEL[territory.size]}
        </span>
        <span className="text-sm text-gray-900 truncate flex-1">
          {displayName || <span className="text-gray-400 italic">Unnamed territory</span>}
        </span>
        <span className="text-xs text-gray-500">
          Combos {clashTerritoryComboNumbers(index).join(', ')}
        </span>
        {territory.points && <span className="text-xs text-gray-500">{territory.points} pts</span>}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_100px] gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Territory name</label>
              <input
                value={displayName}
                onChange={(e) =>
                  onChange({ name: setLocalized(territory.name as never, lang, e.target.value, defaultLang) })
                }
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points</label>
              <input
                value={territory.points ?? ''}
                onChange={(e) => onChange({ points: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">{SIZE_CONTROL[territory.size]}.</p>

          {!isSmall && (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Complete image — shown when one clan conquers the whole territory
              </p>
              <AssetUploadField
                slot={makeSlot(`territory_${index}_complete`, 'Territory complete image')}
                value={territory.complete_image ?? ''}
                onChange={(filename) => onChange({ complete_image: filename })}
              />
            </div>
          )}
          {isSmall && (
            <p className="text-xs text-gray-400 italic">
              Small territory: the combination's main image doubles as the territory-complete image.
            </p>
          )}

          <div className="space-y-2">
            {combinations.map((c, ci) => (
              <CombinationCard
                key={c.id ?? ci}
                combination={c}
                territoryIndex={index}
                index={ci}
                lang={lang}
                defaultLang={defaultLang}
                onChange={(patch) => updateCombination(ci, patch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TerritoriesSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const territories = ((editor.gameMeta as Record<string, unknown>).territories ?? []) as ClashTerritory[];

  function updateTerritory(idx: number, patch: Partial<ClashTerritory>) {
    editor.setGameMeta((m) => {
      const list = ((m as Record<string, unknown>).territories ?? []) as ClashTerritory[];
      const next = list.map((t, i) => (i === idx ? { ...t, ...patch } : t));
      return { ...(m as Record<string, unknown>), territories: next } as typeof m;
    });
  }

  return (
    <CollapsibleSection title="Territories & combinations">
      <p className="text-xs text-gray-500 mb-3">
        Fixed structure: 1 large (3 combinations), 2 medium (2 each), 1 small (1) — 8 combinations
        over 24 balises. The balise→combination mapping is set in the Clash pattern.
      </p>
      {territories.length === 0 ? (
        <p className="text-sm text-gray-500">No territories — reset the scenario to restore the skeleton.</p>
      ) : (
        <div className="space-y-2">
          {territories.map((t, i) => (
            <TerritoryCard
              key={t.id ?? i}
              territory={t}
              index={i}
              lang={lang}
              defaultLang={defaultLang}
              onChange={(patch) => updateTerritory(i, patch)}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
