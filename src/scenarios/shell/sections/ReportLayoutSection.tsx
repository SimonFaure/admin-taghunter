/**
 * Report-layout override section. By default a scenario prints with the global
 * per-game-type layout designed in admin → Report layouts. Here the author can
 * opt into a per-scenario custom layout, stored in game_meta.report_layout and
 * synced with the scenario. The playground resolves: this override → synced
 * default → built-in fallback.
 */

import { useTranslation, Trans } from 'react-i18next';
import { useScenarioEditor } from '../useScenarioEditor';
import { getAdapter } from '../../registry';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { ReportLayoutEditor } from '../../../components/ReportLayoutEditor';
import { defaultReportLayout, STAT_FIELDS_BY_TYPE, normalizeReportGameType, isReportLayout } from '../../../lib/reportLayoutDefaults';
import type { ReportLayout } from '../../../lib/api';

export function ReportLayoutSection() {
  const { t } = useTranslation('editorSections3');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const gameType = normalizeReportGameType(editor.gameType ?? '');
  // Display label from the adapter registry (e.g. `tracks` → "Track"); the
  // normalized `gameType` above stays the code, used for layout/field lookups.
  const gameTypeLabel = getAdapter(editor.gameType ?? '')?.label ?? gameType;
  const setKey = (k: string, v: unknown) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [k]: v }) as typeof m);

  const raw = meta.report_layout;
  const override: ReportLayout | null = isReportLayout(raw) ? (raw as ReportLayout) : null;
  const availableFields = STAT_FIELDS_BY_TYPE[gameType] ?? [];

  return (
    <CollapsibleSection title={t('reportLayout.title')}>
      {/* Per-scenario report texts. These always apply (independent of the
          custom-layout toggle below); a blank value falls back to the per-game-type
          default set in admin → Report layouts. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 pb-4 border-b border-gray-200">
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">{t('reportLayout.pdfTitle')}</span>
          <input
            type="text"
            value={String(meta.pdf_title ?? '')}
            onChange={(e) => setKey('pdf_title', e.target.value)}
            placeholder={t('reportLayout.pdfTitlePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <span className="text-xs text-gray-500 mt-1 block">{t('reportLayout.pdfTitleHint')}</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">{t('reportLayout.teamTitle')}</span>
          <input
            type="text"
            value={String(meta.team_title ?? '')}
            onChange={(e) => setKey('team_title', e.target.value)}
            placeholder={t('reportLayout.teamTitlePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <span className="text-xs text-gray-500 mt-1 block">{t('reportLayout.teamTitleHint')}</span>
        </label>
      </div>

      {!override ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <Trans
              t={t}
              i18nKey="reportLayout.defaultIntro"
              values={{ gameType: gameTypeLabel }}
              components={[
                <span className="font-medium capitalize" />,
                <span className="font-medium" />,
              ]}
            />
          </p>
          <button
            type="button"
            onClick={() => setKey('report_layout', defaultReportLayout(gameType))}
            className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white"
          >
            {t('reportLayout.useCustom')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">{t('reportLayout.customActive', { gameType })}</p>
            <button
              type="button"
              onClick={() => setKey('report_layout', undefined)}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              {t('reportLayout.removeCustom')}
            </button>
          </div>
          {/* The shared editor is dark-themed; wrap so it reads on the light scenario page. */}
          <div className="bg-slate-900 rounded-xl p-4">
            <ReportLayoutEditor
              layout={override}
              availableFields={availableFields}
              previewHeight={460}
              onChange={(next) => setKey('report_layout', next)}
            />
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
