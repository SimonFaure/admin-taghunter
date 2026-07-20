/**
 * Tag Hunter GO option - the "en haut" toggle that turns a Mystery scenario into
 * a GO-capable scenario (the hardware-free, phone-browser variant). When on, the
 * editor reveals GO fields (per-enigma short codes + extra answer images) and
 * marks/collapses the sections GO doesn't use. The scenario can be BOTH RFID and
 * GO - turning this on never removes RFID data.
 *
 * Design: memory project_taghunter_go / plans/tag-hunter-go.md (Phase 1).
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';

export function GoOptionSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  // GO authoring is admin-only - clients never see the "Adaptable à GO" toggle.
  if (!editor.isAdmin) return null;
  const meta = editor.gameMeta as Record<string, unknown>;
  const adaptableGo = meta.adaptable_go === true;
  const answerCount: 2 | 4 = meta.go_answer_count === 4 ? 4 : 2;

  const setMeta = (patch: Record<string, unknown>) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), ...patch }) as typeof m);

  const toggle = (on: boolean) => {
    // Seed a default answer count the first time GO is enabled.
    setMeta({ adaptable_go: on, ...(on && meta.go_answer_count == null ? { go_answer_count: 2 } : {}) });
  };

  return (
    <section
      id="adaptable-go"
      data-section-title={t('editorMystery:goOption.sectionTitle')}
      className={`rounded-lg border p-4 scroll-mt-20 ${
        adaptableGo ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'
      } shadow-sm`}
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          checked={adaptableGo}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          <span className="text-base font-semibold text-gray-900">{t('editorMystery:goOption.toggleLabel')}</span>
          <span className="mt-0.5 block text-sm text-gray-600">
            {t('editorMystery:goOption.description')}
          </span>
        </span>
      </label>

      {adaptableGo && (
        <div className="mt-4 border-t border-emerald-200 pt-4">
          <div className="text-sm font-medium text-gray-800">{t('editorMystery:goOption.answerOptions')}</div>
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
          <p className="mt-2 text-xs text-gray-500">
            {t('editorMystery:goOption.hint')}
          </p>
        </div>
      )}
    </section>
  );
}
