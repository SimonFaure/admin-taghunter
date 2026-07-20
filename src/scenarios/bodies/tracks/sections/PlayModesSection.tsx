/**
 * Play modes section - Itinéraire (ordered) vs Libre (any order).
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type PlayModeKey = 'itinerary' | 'free';

function getPlayModes(t: TFunction): ReadonlyArray<{ key: PlayModeKey; label: string; help: string }> {
  return [
    { key: 'itinerary', label: t('editorTracks:playModes.items.itinerary.label'), help: t('editorTracks:playModes.items.itinerary.help') },
    { key: 'free', label: t('editorTracks:playModes.items.free.label'), help: t('editorTracks:playModes.items.free.help') },
  ];
}

export function PlayModesSection() {
  const { t } = useTranslation();
  const PLAY_MODES = getPlayModes(t);
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const playModes = (meta.play_modes ?? {}) as Record<PlayModeKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: PlayModeKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          play_modes: { ...playModes, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title={t('editorTracks:playModes.sectionTitle')}>
      <p className="text-xs text-gray-500 mb-3">
        {t('editorTracks:playModes.hint')}
      </p>
      <div className="space-y-2">
        {PLAY_MODES.map((p) => (
          <label key={p.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!playModes[p.key]?.enabled}
              onChange={(ev) => setEnabled(p.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{p.label}</span>
              <span className="text-gray-500"> - {p.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
