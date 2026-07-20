/**
 * Routes section - 5 fixed presets, operator opts in to which ones are
 * available at launch. At least one must be enabled (validator enforces).
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type RouteKey = 'default' | 'first_half' | 'last_half' | 'odd' | 'even';

function getRoutes(t: TFunction): ReadonlyArray<{ key: RouteKey; label: string; help: string }> {
  return [
    { key: 'default', label: t('editorTracks:routes.items.default.label'), help: t('editorTracks:routes.items.default.help') },
    { key: 'first_half', label: t('editorTracks:routes.items.first_half.label'), help: t('editorTracks:routes.items.first_half.help') },
    { key: 'last_half', label: t('editorTracks:routes.items.last_half.label'), help: t('editorTracks:routes.items.last_half.help') },
    { key: 'odd', label: t('editorTracks:routes.items.odd.label'), help: t('editorTracks:routes.items.odd.help') },
    { key: 'even', label: t('editorTracks:routes.items.even.label'), help: t('editorTracks:routes.items.even.help') },
  ];
}

export function RoutesSection() {
  const { t } = useTranslation();
  const ROUTES = getRoutes(t);
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const routes = (meta.routes ?? {}) as Record<RouteKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: RouteKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          routes: { ...routes, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title={t('editorTracks:routes.sectionTitle')}>
      <p className="text-xs text-gray-500 mb-3">
        {t('editorTracks:routes.hint')}
      </p>
      <div className="space-y-2">
        {ROUTES.map((r) => (
          <label key={r.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!routes[r.key]?.enabled}
              onChange={(ev) => setEnabled(r.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{r.label}</span>
              <span className="text-gray-500"> - {r.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
