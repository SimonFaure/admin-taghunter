// Stable import point for the help system. The kit + content under _generated/ are
// produced by `node scripts/help.mjs --app studio` (runs at predev/prebuild).
//   import { HelpProvider, DocsShell, HelpDot, HelpButton } from '../help';
export * from './_generated/kit';

/** Studio opens the bundled PDF in a new browser tab (served from the dist root). */
export function studioOpenPdf(pdf: string): void {
  window.open(`/${pdf}`, '_blank', 'noopener');
}
