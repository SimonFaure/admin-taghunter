/**
 * Tagquest body - composes the 6 type-specific sections that render
 * gameplay UI not covered by the shell's common sections.
 *
 * NOTE: the HUD text size + colour controls used to be a seventh section here
 * ("Textes du jeu : taille et couleur"). They now live in the Aperçu modal's
 * typography sidebar, where the author picks a role by clicking the text on
 * the rendered HUD instead of matching it to a name in a form. Same data
 * (`game_meta.tagquest_typography`), same helpers - only the surface moved.
 * See ../../preview/TagquestTypographyPanel.tsx.
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