/**
 * Tagquest body — composes the 6 type-specific sections that render
 * gameplay UI not covered by the shell's common sections.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { TagquestImagesSection } from './sections/TagquestImagesSection';
import { TagquestSoundsSection } from './sections/TagquestSoundsSection';
import { MalusComboSection } from './sections/MalusComboSection';
import { PatternSection } from './sections/PatternSection';
import { QuestsSection } from './sections/QuestsSection';
import { ProductTemplateSection } from './sections/ProductTemplateSection';

export function TagquestBody() {
  return (
    <>
      <ProductTemplateSection />
      <TagquestImagesSection />
      <TagquestSoundsSection />
      <MalusComboSection />
      <PatternSection />
      <QuestsSection />
    </>
  );
}