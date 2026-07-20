/**
 * Timing section - default game time and per-minute malus. Operators can
 * override both at launch via the Advanced disclosure in the launch modal.
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

export function TimingSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  function setField(key: 'default_time' | 'default_time_malus', value: string) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);
  }

  return (
    <CollapsibleSection title={t('editorTracks:timing.sectionTitle')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">
            {t('editorTracks:timing.defaultTime')}
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={String(meta.default_time ?? '60')}
            onChange={(ev) => setField('default_time', ev.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">
            {t('editorTracks:timing.malusPerMinute')}
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={String(meta.default_time_malus ?? '1')}
            onChange={(ev) => setField('default_time_malus', ev.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}
