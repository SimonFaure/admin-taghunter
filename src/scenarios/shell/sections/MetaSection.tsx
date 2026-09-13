/**
 * Meta section - title / description / information.
 *
 * Slice 3B: title/description/story now live as `Localized<string>` inside
 * `gameMeta`. Each field is rendered via `<LocalizedField>` and writes to
 * `gameMeta.{title|description|story}` via `setGameMeta`.
 *
 * Retours #16 - "description" and "histoire" read as duplicates. They are now
 * two clearly separated jobs, and the storage key `story` is kept (renaming it
 * would orphan every existing scenario):
 *   - `description` = the PITCH. Player-facing: it is what GO shows on the
 *     sign-up screen and in the per-scenario briefing, and what licensees read
 *     in the catalogue.
 *   - `story` = licensee-facing INFORMATION (labelled "Informations"):
 *     technical / gameplay notes. Never rendered to players - the GO surfaces
 *     that used to print it now print `description`.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../useScenarioEditor';
import { LocalizedField } from '../components/LocalizedField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import type { Localized } from '../../i18n/types';

export function MetaSection() {
  const { t } = useTranslation('editorSections1');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const set = (key: 'title' | 'description' | 'story', next: Localized<string>) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: next }) as typeof m);

  return (
    <CollapsibleSection title={t('meta.sectionTitle')}>
      <div className="space-y-3">
        <LocalizedField
          label={t('meta.title')}
          value={meta.title as Localized<string> | string | undefined}
          onChange={(next) => set('title', next)}
        />
        <div>
          <LocalizedField
            label={t('meta.description')}
            value={meta.description as Localized<string> | string | undefined}
            onChange={(next) => set('description', next)}
            multiline
            rows={3}
          />
          <p className="mt-1 text-xs text-gray-500">{t('meta.descriptionHint')}</p>
        </div>
        <div>
          <LocalizedField
            label={t('meta.story')}
            value={meta.story as Localized<string> | string | undefined}
            onChange={(next) => set('story', next)}
            multiline
            rows={4}
          />
          <p className="mt-1 text-xs text-gray-500">{t('meta.storyHint')}</p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
