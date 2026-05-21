/**
 * Meta section — title / description / story.
 *
 * Slice 3B: title/description/story now live as `Localized<string>` inside
 * `gameMeta`. Each field is rendered via `<LocalizedField>` and writes to
 * `gameMeta.{title|description|story}` via `setGameMeta`.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { useScenarioEditor } from '../useScenarioEditor';
import { LocalizedField } from '../components/LocalizedField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import type { Localized } from '../../i18n/types';

export function MetaSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const set = (key: 'title' | 'description' | 'story', next: Localized<string>) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: next }) as typeof m);

  return (
    <CollapsibleSection title="Scenario info">
      <div className="space-y-3">
        <LocalizedField
          label="Title"
          value={meta.title as Localized<string> | string | undefined}
          onChange={(next) => set('title', next)}
        />
        <LocalizedField
          label="Description"
          value={meta.description as Localized<string> | string | undefined}
          onChange={(next) => set('description', next)}
          multiline
          rows={2}
        />
        <LocalizedField
          label="Story"
          value={meta.story as Localized<string> | string | undefined}
          onChange={(next) => set('story', next)}
          multiline
          rows={4}
        />
      </div>
    </CollapsibleSection>
  );
}
