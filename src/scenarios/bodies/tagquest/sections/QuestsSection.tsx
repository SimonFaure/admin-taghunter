/**
 * Quests section — per-quest editor cards with the "puzzle" layout: main
 * image on the left, 2x2 grid of piece images on the right (mirrors the
 * in-game reveal in PunchAnimationOverlay). Each quest card collapses to a
 * one-line summary so a 10-quest list stays scannable.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useState } from 'react';
import { AlertTriangle, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { Quest } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';
import { TAGQUEST_MAX_QUESTS } from '../adapter';

type PieceKey = 'image_1' | 'image_2' | 'image_3' | 'image_4';

const PIECE_SLOTS: ReadonlyArray<{ key: PieceKey; label: string }> = [
  { key: 'image_1', label: 'Top-left' },
  { key: 'image_2', label: 'Top-right' },
  { key: 'image_3', label: 'Bottom-left' },
  { key: 'image_4', label: 'Bottom-right' },
];

function emptyQuest(): Quest {
  return {
    main_image: '',
    points: '',
    name: {},
    sound: '',
    image_1: '',
    image_2: '',
    image_3: '',
    image_4: '',
  };
}

function makeSlot(key: string, label: string, kind: MediaSlot['kind'], required: MediaSlot['required']): MediaSlot {
  return { key, kind, required, scope: 'type', label };
}

interface QuestCardProps {
  quest: Quest;
  index: number;
  lang: Lang;
  defaultLang: Lang;
  onChange: (patch: Partial<Quest>) => void;
  onRemove: () => void;
}

function QuestCard({ quest, index, lang, defaultLang, onChange, onRemove }: QuestCardProps) {
  const editor = useScenarioEditor();
  const [expanded, setExpanded] = useState(true);

  const piecesUploaded = PIECE_SLOTS.reduce((n, p) => (quest[p.key] ? n + 1 : n), 0);
  const displayName = getLocalized(quest.name as never, lang, defaultLang);

  return (
    <div className="border border-gray-100 rounded-md bg-white">
      {/* Collapsed row — always visible. Acts as the toggle. */}
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1 hover:bg-gray-50 rounded text-gray-400"
          aria-label={expanded ? 'Collapse quest' : 'Expand quest'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {quest.main_image ? (
            <img
              src={editor.getMediaUrl(quest.main_image)}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </div>
        <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
        <span className="text-sm text-gray-900 truncate flex-1">{displayName || <span className="text-gray-400 italic">Unnamed quest</span>}</span>
        <span className={`text-xs ${piecesUploaded === 4 ? 'text-green-600' : 'text-gray-500'}`}>
          {piecesUploaded}/4 pieces
        </span>
        {quest.points && <span className="text-xs text-gray-500">{quest.points} pts</span>}
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 hover:bg-red-50 rounded text-red-500"
          aria-label="Remove quest"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          {/* Header strip — name + points */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quest name</label>
              <input
                value={displayName}
                onChange={(e) =>
                  onChange({ name: setLocalized(quest.name as never, lang, e.target.value, defaultLang) })
                }
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points</label>
              <input
                value={quest.points ?? ''}
                onChange={(e) => onChange({ points: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>

          {/* Puzzle layout — main image (left) + 2x2 pieces (right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">
                The complete picture revealed when all 4 pieces are found
              </p>
              <AssetUploadField
                slot={makeSlot('main_image', 'Main image', 'image', 'error')}
                value={quest.main_image ?? ''}
                onChange={(filename) => onChange({ main_image: filename })}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Four images to find <span className="text-gray-400">— each forms one quadrant of the main image</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PIECE_SLOTS.map((p) => (
                  <AssetUploadField
                    key={p.key}
                    slot={makeSlot(p.key, p.label, 'image', 'error')}
                    value={(quest[p.key] as string | undefined) ?? ''}
                    onChange={(filename) => onChange({ [p.key]: filename } as Partial<Quest>)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Sound */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Played when the quest is completed</p>
            <AssetUploadField
              slot={makeSlot('sound', 'Quest sound', 'sound', false)}
              value={quest.sound ?? ''}
              onChange={(filename) => onChange({ sound: filename })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function QuestsSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const quests = ((editor.gameMeta as Record<string, unknown>).quests ?? []) as Quest[];

  function setQuests(next: Quest[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), quests: next }) as typeof m);
  }

  const atCap = quests.length >= TAGQUEST_MAX_QUESTS;
  const overCap = quests.length > TAGQUEST_MAX_QUESTS;

  function addQuest() {
    if (atCap) return;
    setQuests([...quests, emptyQuest()]);
  }

  function removeQuest(idx: number) {
    setQuests(quests.filter((_, i) => i !== idx));
  }

  function updateQuest(idx: number, patch: Partial<Quest>) {
    setQuests(quests.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  return (
    <CollapsibleSection
      title="Quests"
      headerExtra={
        <button
          onClick={addQuest}
          disabled={atCap}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title={atCap ? `Maximum ${TAGQUEST_MAX_QUESTS} quests` : 'Add a new quest'}
        >
          <Plus className="w-3 h-3" /> Add quest
        </button>
      }
    >
      {overCap && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            This scenario has {quests.length} quests but Tagquest now supports a
            maximum of {TAGQUEST_MAX_QUESTS}. The extra {quests.length - TAGQUEST_MAX_QUESTS} quest(s)
            will be removed when you save. Delete unwanted quests to choose which ones are kept.
          </span>
        </div>
      )}
      {quests.length === 0 ? (
        <p className="text-sm text-gray-500">No quests yet.</p>
      ) : (
        <div className="space-y-2">
          {quests.map((q, i) => (
            <QuestCard
              key={i}
              quest={q}
              index={i}
              lang={lang}
              defaultLang={defaultLang}
              onChange={(patch) => updateQuest(i, patch)}
              onRemove={() => removeQuest(i)}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
