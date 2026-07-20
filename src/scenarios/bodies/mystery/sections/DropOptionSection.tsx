/**
 * Tag Hunter Drop option - the "en haut" toggle that marks a Mystery scenario
 * as Drop-capable (the hardware-free, on-screen-image variant where answer
 * images appear on the device instead of being scanned via RFID). A scenario
 * can be BOTH RFID/GO and Drop - turning this on never removes RFID data.
 *
 * Mirrors GoOptionSection. Drop has no answer-key pattern, so this is a single
 * enable toggle with no sub-options.
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';

export function DropOptionSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  // Drop authoring is admin-only - clients never see the "Adaptable à Drop" toggle.
  if (!editor.isAdmin) return null;
  const meta = editor.gameMeta as Record<string, unknown>;
  const adaptableDrop = meta.adaptable_drop === true;

  const toggle = (on: boolean) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), adaptable_drop: on }) as typeof m);

  return (
    <section
      id="adaptable-drop"
      data-section-title={t('editorMystery:dropOption.sectionTitle')}
      className={`rounded-lg border p-4 scroll-mt-20 ${
        adaptableDrop ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'
      } shadow-sm`}
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          checked={adaptableDrop}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          <span className="text-base font-semibold text-gray-900">{t('editorMystery:dropOption.toggleLabel')}</span>
          <span className="mt-0.5 block text-sm text-gray-600">
            {t('editorMystery:dropOption.description')}
          </span>
        </span>
      </label>
    </section>
  );
}
