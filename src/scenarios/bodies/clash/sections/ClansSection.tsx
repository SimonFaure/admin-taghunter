/**
 * Clans section — author up to 4 clans (name, colour, seal). Launch picks
 * 2-4 active clans and may override names; seals/colours are fixed here.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import { Plus, Trash2 } from 'lucide-react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { ClashClan } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';

export const CLASH_MIN_CLANS = 2;
export const CLASH_MAX_CLANS = 4;

const DEFAULT_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];

function makeSlot(key: string, label: string): MediaSlot {
  return { key, kind: 'image', required: false, scope: 'type', label };
}

function emptyClan(index: number): ClashClan {
  return {
    id: `clan_${index + 1}`,
    name: {},
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    seal: '',
  };
}

export function ClansSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const clans = ((editor.gameMeta as Record<string, unknown>).clans ?? []) as ClashClan[];

  function setClans(next: ClashClan[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), clans: next }) as typeof m);
  }

  const atMax = clans.length >= CLASH_MAX_CLANS;
  const atMin = clans.length <= CLASH_MIN_CLANS;

  function addClan() {
    if (atMax) return;
    setClans([...clans, emptyClan(clans.length)]);
  }

  function removeClan(idx: number) {
    if (atMin) return;
    setClans(clans.filter((_, i) => i !== idx));
  }

  function updateClan(idx: number, patch: Partial<ClashClan>) {
    setClans(clans.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  return (
    <CollapsibleSection
      title="Clans"
      headerExtra={
        <button
          onClick={addClan}
          disabled={atMax}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title={atMax ? `Maximum ${CLASH_MAX_CLANS} clans` : 'Add a clan'}
        >
          <Plus className="w-3 h-3" /> Add clan
        </button>
      }
    >
      <p className="text-xs text-gray-500 mb-3">
        Author up to {CLASH_MAX_CLANS} clans. The operator chooses how many are active (2-4) and
        may rename them at launch; seals and colours are fixed here.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clans.map((clan, i) => {
          const displayName = getLocalized(clan.name as never, lang, defaultLang);
          return (
            <div key={clan.id ?? i} className="border border-gray-100 rounded-md bg-white p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0"
                  style={{ backgroundColor: clan.color || '#999' }}
                />
                <span className="text-sm font-medium text-gray-500">Clan {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeClan(i)}
                  disabled={atMin}
                  className="ml-auto p-1.5 hover:bg-red-50 rounded text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Remove clan"
                  title={atMin ? `At least ${CLASH_MIN_CLANS} clans required` : 'Remove clan'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-[1fr_72px] gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default name</label>
                  <input
                    value={displayName}
                    onChange={(e) =>
                      updateClan(i, { name: setLocalized(clan.name as never, lang, e.target.value, defaultLang) })
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Colour</label>
                  <input
                    type="color"
                    value={clan.color || '#999999'}
                    onChange={(e) => updateClan(i, { color: e.target.value })}
                    className="w-full h-[34px] border border-gray-300 rounded-md cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Seal / banner shown on owned territories</p>
                <AssetUploadField
                  slot={makeSlot(`clan_${i}_seal`, 'Clan seal')}
                  value={clan.seal ?? ''}
                  onChange={(filename) => updateClan(i, { seal: filename })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
