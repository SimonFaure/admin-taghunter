/**
 * Tagquest preview modal - chrome around `<TagquestPreviewRenderer>`.
 *
 * Reads live in-memory `gameMeta` + `quests` from the scenario editor
 * context (no save required). Header controls let the author step through
 * quests, toggle the Pieces/Revealed view, toggle malus overlays, and pick
 * a canonical viewport.
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { getLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { TagquestPreviewRenderer, type PreviewQuest, type QuestView } from './TagquestPreviewRenderer';
import { ViewportSelect } from './ViewportSelect';
import { DEFAULT_VIEWPORT, type ViewportSize } from './viewportTypes';
import { getPreviewLabels } from './previewLabels';
import { useAdminTranslations } from './useAdminTranslations';

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
  const adminLabels = useAdminTranslations();

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

          {/* Spacer */}
          <div className="ml-auto flex items-center gap-3">
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

        {/* ----- Renderer ----- */}
        <div className="flex-1 flex min-h-0">
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
          />
        </div>
      </div>
    </div>
  );
}
