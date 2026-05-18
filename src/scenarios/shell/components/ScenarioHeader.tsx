/**
 * Shell header — back button, scenario title, game-type badge.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { ArrowLeft } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { getLocalized } from '../../i18n/getLocalized';
import type { Lang } from '../../i18n/types';

export function ScenarioHeader() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const title = getLocalized(
    meta.title as never,
    editor.currentLanguage as Lang,
    editor.defaultLanguage as Lang,
  );
  return (
    <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center gap-3">
        <button
          onClick={editor.onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">{editor.adapter.label}</div>
          <h1 className="text-lg font-semibold text-gray-900">
            {title || <span className="text-gray-400">Untitled scenario</span>}
          </h1>
        </div>
      </div>
      {editor.isDirty && (
        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
          Unsaved changes
        </span>
      )}
    </div>
  );
}