/**
 * Mystery body - composes the 6 type-specific sections that render
 * gameplay UI not covered by the shell's common sections.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { GoSpotSection } from './sections/GoSpotSection';
import { InstructionsSection } from './sections/InstructionsSection';
import { GaugeSection } from './sections/GaugeSection';
import { FrameSection } from './sections/FrameSection';
import { ScoringSection } from './sections/ScoringSection';
import { EnigmaTimingSection } from './sections/EnigmaTimingSection';
import { PatternSection } from './sections/PatternSection';
import { EnigmasSection } from './sections/EnigmasSection';

export function MysteryBody() {
  return (
    <>
      <GoSpotSection />
      <InstructionsSection />
      <GaugeSection />
      <FrameSection />
      <ScoringSection />
      <EnigmaTimingSection />
      <PatternSection />
      <EnigmasSection />
    </>
  );
}
