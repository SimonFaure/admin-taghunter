/**
 * Display modes section - full / map / simple. Operator picks one at launch.
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type DisplayKey = 'full' | 'map' | 'simple';

function getDisplays(t: TFunction): ReadonlyArray<{ key: DisplayKey; label: string; help: string }> {
  return [
    { key: 'full', label: t('editorTracks:displays.items.full.label'), help: t('editorTracks:displays.items.full.help') },
    { key: 'map', label: t('editorTracks:displays.items.map.label'), help: t('editorTracks:displays.items.map.help') },
    { key: 'simple', label: t('editorTracks:displays.items.simple.label'), help: t('editorTracks:displays.items.simple.help') },
  ];
}

export function DisplaysSection() {
  const { t } = useTranslation();
  const DISPLAYS = getDisplays(t);
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const displays = (meta.displays ?? {}) as Record<DisplayKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: DisplayKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          displays: { ...displays, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title={t('editorTracks:displays.sectionTitle')}>
      <p className="text-xs text-gray-500 mb-3">
        {t('editorTracks:displays.hint')}
      </p>
      <div className="space-y-2">
        {DISPLAYS.map((d) => (
          <label key={d.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!displays[d.key]?.enabled}
              onChange={(ev) => setEnabled(d.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{d.label}</span>
              <span className="text-gray-500"> - {d.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
