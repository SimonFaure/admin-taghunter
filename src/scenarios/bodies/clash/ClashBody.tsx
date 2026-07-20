/**
 * Clash body - composes the type-specific sections (clans, territories &
 * combinations, map & pattern) on top of the shell's common sections.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import { ClansSection } from './sections/ClansSection';
import { TerritoriesSection } from './sections/TerritoriesSection';
import { ClashMapSection } from './sections/ClashMapSection';
import { ClashPurgeSection } from './sections/ClashPurgeSection';
// Reused as-is - the tracks text-elements section is game-type-agnostic (it
// edits gameMeta.text_elements + text_categories). Positions are placed in the
// LayoutEditor over the map.
import { TextElementsSection } from '../tracks/sections/TextElementsSection';

export function ClashBody() {
  return (
    <>
      <ClashMapSection />
      <ClansSection />
      <TerritoriesSection />
      <ClashPurgeSection />
      <TextElementsSection />
    </>
  );
}
