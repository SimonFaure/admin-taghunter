/**
 * Display options section.
 *
 *   - display_score: show score during play (scenario-locked)
 *   - show_legend: feedback-image legend box on the map (reveal + clues page);
 *     placed/resized in the layout editor as the `legend` element. This is the
 *     scenario's DEFAULT - the playground operator can flip it per launch
 *     (launch modal > Advanced), which is why the two captions below stay
 *     editable even while the option is off.
 *   - text_legend_*: the legend captions; blank = the app's own caption
 *
 * The "auto-reset after animation" toggle was removed (the runtime keeps its
 * 5s auto-reset default), and "clues page on team return" moved to the
 * playground launch modal as a per-launch option (see GameConfig.cluesPage).
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { LocalizedField } from '../../../shell/components/LocalizedField';
import { INGAME_CATALOG } from '../../../../i18n/ingameCatalog';
import type { Localized } from '../../../i18n/types';

// Feedback images the legend lists, with their media-slot label keys, the
// game_meta key of their authored caption and the app caption it overrides.
const LEGEND_IMAGES = [
  {
    key: 'wrong_order_image',
    labelKey: 'tracks_wrong_order_image',
    textKey: 'text_legend_wrong_order',
    captionKey: 'legend_wrong_order',
  },
  {
    key: 'missing_checkpoint_image',
    labelKey: 'tracks_missing_checkpoint_image',
    textKey: 'text_legend_missing_checkpoint',
    captionKey: 'legend_missing_checkpoint',
  },
] as const;

export function DisplayOptionsSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const displayScore = meta.display_score !== false;
  const showLegend = meta.show_legend === true;
  const missingLegendImages = LEGEND_IMAGES.filter((img) => !String(meta[img.key] ?? '').trim());

  function setDisplayScore(v: boolean) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), display_score: v }) as typeof m);
  }

  function setShowLegend(v: boolean) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), show_legend: v }) as typeof m);
  }

  // The caption the runtime falls back to when the field is left blank, in the
  // language being edited (bundled seed, like the layout editor preview).
  function defaultCaption(captionKey: string) {
    const def = INGAME_CATALOG.ingame_tracks.find((d) => d.key === captionKey);
    return def ? def.seed[editor.currentLanguage] ?? def.seed.en : '';
  }

  return (
    <CollapsibleSection title={t('editorTracks:displayOptions.sectionTitle')}>
      <div className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={displayScore}
            onChange={(ev) => setDisplayScore(ev.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-gray-900">{t('editorTracks:displayOptions.displayScore')}</span>
            <span className="block text-gray-500 text-xs">
              {t('editorTracks:displayOptions.displayScoreHint')}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={showLegend}
            onChange={(ev) => setShowLegend(ev.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-gray-900">{t('editorTracks:displayOptions.showLegend')}</span>
            <span className="block text-gray-500 text-xs">
              {t('editorTracks:displayOptions.showLegendHint')}
            </span>
            {showLegend &&
              missingLegendImages.map((img) => (
                <span key={img.key} className="block text-amber-700 text-xs mt-1">
                  {t('editorTracks:displayOptions.legendMissingImage', {
                    image: t('mediaSlots:' + img.labelKey),
                  })}
                </span>
              ))}
          </span>
        </label>
        <div className="ml-6 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LEGEND_IMAGES.map((img) => (
              <LocalizedField
                key={img.textKey}
                label={t('editorTracks:displayOptions.legendText', {
                  image: t('mediaSlots:' + img.labelKey),
                })}
                value={meta[img.textKey] as Localized<string> | string | undefined}
                placeholder={defaultCaption(img.captionKey)}
                onChange={(next) =>
                  editor.setGameMeta(
                    (m) => ({ ...(m as Record<string, unknown>), [img.textKey]: next }) as typeof m,
                  )
                }
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">{t('editorTracks:displayOptions.legendTextHint')}</p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
