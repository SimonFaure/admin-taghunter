/**
 * Shell save bar — Save / Publish / Download ZIP actions + dirty/alert surface.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useState } from 'react';
import { Save, Send, Download, Eye, ChevronsDownUp, ChevronsUpDown, LayoutGrid as Layout } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { TagquestPreviewModal } from '../../preview/TagquestPreviewModal';
import { MysteryPreviewModal } from '../../preview/MysteryPreviewModal';
import { useCollapseAll } from './CollapsibleSection';

export function SaveBar() {
  const editor = useScenarioEditor();
  const busy = editor.isSaving || editor.isPublishing;
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewSupported = editor.gameType === 'tagquest' || editor.gameType === 'mystery';
  const { allCollapsed, toggleAll } = useCollapseAll();
  // Layout editor button is hidden for game types that don't use a layout JSON
  // (tagquest renders via defaultTagquestLayout; mystery has fixed CSS).
  const showLayoutButton = editor.gameType !== 'tagquest' && editor.gameType !== 'mystery';

  return (
    <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-2">
      <button
        onClick={() => editor.save()}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Save className="w-4 h-4" />
        {editor.isSaving ? 'Saving...' : 'Save'}
      </button>

      <button
        onClick={() => editor.publish()}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="w-4 h-4" />
        {editor.isPublishing ? 'Publishing...' : 'Publish'}
      </button>

      <button
        onClick={() => editor.downloadZip()}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download className="w-4 h-4" />
        Download ZIP
      </button>

      {previewSupported && (
        <button
          onClick={() => setPreviewOpen(true)}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
      )}

      <button
        onClick={toggleAll}
        disabled={busy}
        className={`${previewSupported ? '' : 'ml-auto'} inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors`}
        title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
      >
        {allCollapsed ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>

      {showLayoutButton && (
        <button
          onClick={editor.onOpenLayoutEditor}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <Layout className="w-4 h-4" />
          Layout editor
        </button>
      )}

      {previewSupported && editor.gameType === 'tagquest' && (
        <TagquestPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
      )}
      {previewSupported && editor.gameType === 'mystery' && (
        <MysteryPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
