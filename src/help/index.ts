// Stable import point for the help system. The kit + content under _generated/ are
// produced by `node scripts/help.mjs --app studio` (runs at predev/prebuild).
//   import { HelpProvider, DocsShell, HelpDot, HelpButton } from '../help';
export * from './_generated/kit';
import { helpManifest } from './_generated';

/**
 * Studio opens the bundled PDF in a new browser tab (served from the dist root). The ?v=
 * build stamp stops a browser or proxy from serving a PDF left over from an older deploy.
 */
export function studioOpenPdf(pdf: string): void {
  const v = helpManifest.pdfVersion;
  window.open(`/${pdf}${v ? `?v=${v}` : ''}`, '_blank', 'noopener');
}
