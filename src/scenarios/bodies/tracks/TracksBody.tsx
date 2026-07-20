/**
 * Tracks body - composes the type-specific sections that render the editor UI
 * not covered by the shell's common sections (typography, meta, podium,
 * scenario video, downloadables on the detail view).
 *
 * Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
 */

import { CheckpointsSection } from './sections/CheckpointsSection';
import { RoutesSection } from './sections/RoutesSection';
import { DisplaysSection } from './sections/DisplaysSection';
import { PlayModesSection } from './sections/PlayModesSection';
import { ScoreTypesSection } from './sections/ScoreTypesSection';
import { TimingSection } from './sections/TimingSection';
import { DisplayOptionsSection } from './sections/DisplayOptionsSection';
import { HudFramesSection } from './sections/HudFramesSection';
import { TextElementsSection } from './sections/TextElementsSection';
import { FeedbackImagesSection } from './sections/FeedbackImagesSection';
import { SoundsSection } from './sections/SoundsSection';
import { PatternSection } from './sections/PatternSection';

export function TracksBody() {
  return (
    <>
      <PatternSection />
      <CheckpointsSection />
      <RoutesSection />
      <DisplaysSection />
      <PlayModesSection />
      <ScoreTypesSection />
      <TimingSection />
      <DisplayOptionsSection />
      <HudFramesSection />
      <TextElementsSection />
      <FeedbackImagesSection />
      <SoundsSection />
    </>
  );
}
