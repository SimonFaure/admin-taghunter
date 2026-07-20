/**
 * Mystery's stacked "en haut" adaptation toggles: Tag Hunter GO and Tag Hunter
 * Drop. The shell exposes a single `TopSection` slot, so both live here. Each
 * renders its own <section>; the shell's <main space-y-4> spaces them.
 */

import { GoOptionSection } from './GoOptionSection';
import { DropOptionSection } from './DropOptionSection';

export function MysteryTopSection() {
  return (
    <>
      <GoOptionSection />
      <DropOptionSection />
    </>
  );
}
