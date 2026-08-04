/**
 * "Tag Hunter GO & Drop" section - the two hardware-free adaptations of a
 * Mystery scenario, authored together because they share their content.
 *
 * Top: the two independent "Adaptable à ..." toggles (a scenario can be RFID,
 * GO and Drop at once - turning either on never removes RFID data). Below them,
 * COMMON to both: the number of answer options (`go_answer_count`), which drives
 * GO's letters (A/B vs A/B/C/D) and Drop's on-screen tile count, plus the extra
 * wrong-answer image slots per enigma when set to 4.
 *
 * Replaces the former stacked TopSection pair (GoOptionSection +
 * DropOptionSection) so GO/Drop reads like every other editor section.
 *
 * Design: memory project_taghunter_go / project_taghunter_drop.
 */

import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';

export function GoDropSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  // GO/Drop authoring is admin-only - clients never see these toggles.
  if (!editor.isAdmin) return null;
  const meta = editor.gameMeta as Record<string, unknown>;
  const adaptableGo = meta.adaptable_go === true;
  const adaptableDrop = meta.adaptable_drop === true;
  const answerCount: 2 | 4 = meta.go_answer_count === 4 ? 4 : 2;

  const setMeta = (patch: Record<string, unknown>) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), ...patch }) as typeof m);

  // Seed a default answer count the first time either adaptation is enabled.
  const seed = (on: boolean) =>
    on && meta.go_answer_count == null ? { go_answer_count: 2 } : {};

  return (
    <CollapsibleSection title={t('editorMystery:goDrop.title')}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
            adaptableGo ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'
          }`}
        >
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            checked={adaptableGo}
            onChange={(e) => setMeta({ adaptable_go: e.target.checked, ...seed(e.target.checked) })}
          />
          <span>
            <span className="text-sm font-semibold text-gray-900">
              {t('editorMystery:goOption.toggleLabel')}
            </span>
            <span className="mt-0.5 block text-xs text-gray-600">
              {t('editorMystery:goOption.description')}
            </span>
          </span>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
            adaptableDrop ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'
          }`}
        >
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            checked={adaptableDrop}
            onChange={(e) => setMeta({ adaptable_drop: e.target.checked, ...seed(e.target.checked) })}
          />
          <span>
            <span className="text-sm font-semibold text-gray-900">
              {t('editorMystery:dropOption.toggleLabel')}
            </span>
            <span className="mt-0.5 block text-xs text-gray-600">
              {t('editorMystery:dropOption.description')}
            </span>
          </span>
        </label>
      </div>

      {(adaptableGo || adaptableDrop) && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="text-sm font-medium text-gray-800">
            {t('editorMystery:goOption.answerOptions')}
          </div>
          <div className="mt-2 flex gap-3">
            {([2, 4] as const).map((n) => (
              <label
                key={n}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  answerCount === n
                    ? 'border-emerald-400 bg-white font-medium text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="go_answer_count"
                  className="text-emerald-600 focus:ring-emerald-500"
                  checked={answerCount === n}
                  onChange={() => setMeta({ go_answer_count: n })}
                />
                {n === 2 ? t('editorMystery:goOption.option2') : t('editorMystery:goOption.option4')}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('editorMystery:goDrop.answerHint')}</p>
        </div>
      )}
    </CollapsibleSection>
  );
}
