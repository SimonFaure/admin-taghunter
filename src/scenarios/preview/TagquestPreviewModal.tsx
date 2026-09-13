/**
 * Tagquest preview modal - chrome around `<TagquestPreviewRenderer>`.
 *
 * Reads live in-memory `gameMeta` + `quests` from the scenario editor
 * context (no save required). Header controls let the author step through
 * quests, toggle the Pieces/Revealed view, toggle malus overlays, and pick
 * a canonical viewport.
 *
 * It is also Quest's LAYOUT EDITOR for text: the "taille & couleur" toggle
 * turns the HUD texts into role pickers and opens `TagquestTypographyPanel`,
 * which replaced the old scenario-editor section of the same name. Positions
 * are not authorable (they are fixed by `defaultTagquestLayout`, mirrored by
 * the playground), so size and colour are all this mode edits.
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { getLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { TagquestPreviewRenderer, type PreviewQuest, type QuestView } from './TagquestPreviewRenderer';
import { TagquestTypographyPanel } from './TagquestTypographyPanel';
import type { TagquestTextCategoryId } from '../bodies/tagquest/typographyCategories';
import { ViewportSelect } from './ViewportSelect';
import { DEFAULT_VIEWPORT, type ViewportSize } from './viewportTypes';
import { getPreviewLabels } from './previewLabels';
import { useAdminTranslations } from './useAdminTranslations';
import { useTagquestDefaults } from './useTagquestDefaults';
import { readTagquestTypography, type TagquestTypography } from '../bodies/tagquest/typographyCategories';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';

interface TagquestPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export function TagquestPreviewModal({ open, onClose }: TagquestPreviewModalProps) {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const [questIndex, setQuestIndex] = useState(0);
  const [questView, setQuestView] = useState<QuestView>('pieces');
  const [showMalus, setShowMalus] = useState(false);
  const [showLateMalus, setShowLateMalus] = useState(false);
  const [viewport, setViewport] = useState<ViewportSize>(DEFAULT_VIEWPORT);
  const [fullscreen, setFullscreen] = useState(false);
  // Typography editing: off by default so the modal still opens as a plain
  // preview. On, the HUD texts become role pickers and the sidebar appears.
  const [textMode, setTextMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TagquestTextCategoryId | null>(null);
  const adminLabels = useAdminTranslations();
  // Studio-wide Quest defaults (admin "Default layouts" page): the starting
  // point this scenario's own values sit on top of, and the positions the HUD
  // is drawn at. The playground resolves both the same way.
  const tagquestDefaults = useTagquestDefaults();

  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const meta = editor.gameMeta as Record<string, unknown>;
  const quests = useMemo<PreviewQuest[]>(() => {
    const raw = (meta.quests ?? []) as PreviewQuest[];
    return raw;
  }, [meta.quests]);

  // Reset transient state when the modal opens.
  useEffect(() => {
    if (open) {
      setQuestIndex(0);
      setQuestView('pieces');
      setShowMalus(false);
      setShowLateMalus(false);
      setFullscreen(false);
      setTextMode(false);
      setSelectedCategory(null);
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const safeIndex = quests.length === 0 ? 0 : Math.min(Math.max(questIndex, 0), quests.length - 1);
  const activeQuest = quests[safeIndex];
  const activeQuestName = activeQuest
    ? getLocalized(activeQuest.name as never, lang, defaultLang) ||
      t('scenarioPreview:tagquestPreview.questFallback', { number: safeIndex + 1 })
    : '';

  function step(delta: number) {
    if (quests.length === 0) return;
    setQuestIndex((i) => (i + delta + quests.length) % quests.length);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${fullscreen ? 'p-0' : 'p-4'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative bg-white shadow-2xl flex flex-col overflow-hidden ${
          fullscreen ? 'w-screen h-screen rounded-none' : 'w-[90vw] h-[90vh] rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ----- Header ----- */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-slate-50 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900 mr-2">{t('scenarioPreview:tagquestPreview.title')}</h2>

          {/* Quest stepper */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={quests.length <= 1}
              className="p-1 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-30"
              aria-label={t('scenarioPreview:tagquestPreview.previousQuest')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-700 min-w-[140px] text-center">
              {quests.length === 0
                ? t('scenarioPreview:tagquestPreview.noQuests')
                : activeQuestName
                  ? t('scenarioPreview:tagquestPreview.questCounterNamed', {
                      current: safeIndex + 1,
                      total: quests.length,
                      name: activeQuestName,
                    })
                  : t('scenarioPreview:tagquestPreview.questCounter', {
                      current: safeIndex + 1,
                      total: quests.length,
                    })}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={quests.length <= 1}
              className="p-1 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-30"
              aria-label={t('scenarioPreview:tagquestPreview.nextQuest')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Pieces / Revealed toggle */}
          <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setQuestView('pieces')}
              className={`px-3 py-1 text-xs ${
                questView === 'pieces' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t('scenarioPreview:tagquestPreview.pieces')}
            </button>
            <button
              type="button"
              onClick={() => setQuestView('revealed')}
              className={`px-3 py-1 text-xs ${
                questView === 'revealed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t('scenarioPreview:tagquestPreview.revealed')}
            </button>
          </div>

          {/* Malus toggles */}
          <label className="flex items-center gap-1 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={showMalus}
              onChange={(e) => setShowMalus(e.target.checked)}
            />
            {t('scenarioPreview:tagquestPreview.malusOverlay')}
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={showLateMalus}
              onChange={(e) => setShowLateMalus(e.target.checked)}
            />
            {t('scenarioPreview:tagquestPreview.lateMalusOverlay')}
          </label>

          {/* Typography editing - Quest's layout editor for text size/colour. */}
          <button
            type="button"
            onClick={() => setTextMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border ${
              textMode
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            title={t('editorTagquest:typography.sectionTitle')}
          >
            <Type className="w-3.5 h-3.5" />
            {t('editorTagquest:typography.editButton')}
          </button>

          {/* Spacer */}
          <div className="ml-auto flex items-center gap-3">
            {textMode && (
              <button
                type="button"
                onClick={() => editor.save()}
                disabled={editor.isSaving}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {editor.isSaving
                  ? t('scenarioPreview:ingameLayout.saving')
                  : t('scenarioPreview:ingameLayout.save')}
              </button>
            )}
            <ViewportSelect value={viewport} onChange={setViewport} />
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label={fullscreen ? t('scenarioPreview:tagquestPreview.exitFullscreen') : t('scenarioPreview:tagquestPreview.enterFullscreen')}
              title={fullscreen ? t('scenarioPreview:tagquestPreview.exitFullscreen') : t('scenarioPreview:tagquestPreview.fullscreen')}
            >
              {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label={t('scenarioPreview:tagquestPreview.closePreview')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ----- Renderer (+ typography sidebar when editing) ----- */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0">
            <TagquestPreviewRenderer
              gameMeta={meta as Record<string, unknown>}
              quests={quests}
              resolveMediaUrl={editor.getMediaUrl}
              canonicalWidth={viewport.width}
              canonicalHeight={viewport.height}
              selectedQuestIndex={safeIndex}
              questView={questView}
              showMalusOverlay={showMalus}
              showLateMalusOverlay={showLateMalus}
              readLocalized={(value) => getLocalized(value as never, lang, defaultLang)}
              labels={getPreviewLabels(lang, defaultLang)}
              lang={lang}
              defaultLang={defaultLang}
              adminLabels={adminLabels}
              textEditMode={textMode}
              selectedTextCategory={selectedCategory}
              onSelectTextCategory={setSelectedCategory}
              typographyDefaults={tagquestDefaults.typography}
              layoutOverrides={tagquestDefaults.layout}
            />
          </div>
          {textMode && (
            <TagquestTypographyPanel
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              value={readTagquestTypography(meta.tagquest_typography)}
              onChange={(next: TagquestTypography) =>
                editor.setGameMeta(
                  (m) =>
                    ({ ...(m as Record<string, unknown>), tagquest_typography: next }) as typeof m,
                )
              }
              inherited={tagquestDefaults.typography}
              fontFamily={resolveFontFamily(String(meta.font ?? ''))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
