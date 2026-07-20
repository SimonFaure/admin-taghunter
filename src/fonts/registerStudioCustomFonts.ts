/**
 * Register a scenario's custom fonts as `FontFace`s inside the Studio webview
 * so the Typography picker preview and the scenario preview render them.
 *
 * Studio-side counterpart of the playground's `registerScenarioFonts()` - the
 * only difference is the URL source: a Studio media URL here, the
 * `scenario://` protocol there.
 *
 * Plan: C:\Users\faure\.claude\plans\studio-custom-fonts-typography.md
 */

import type { CustomFont } from '../types/scenario-data';

// `family::url` keys already added to `document.fonts`.
const registered = new Set<string>();

export function registerStudioCustomFonts(
  customFonts: readonly CustomFont[] | undefined,
  mediaUrl: (filename: string) => string,
): void {
  if (typeof document === 'undefined' || !Array.isArray(customFonts)) return;

  for (const cf of customFonts) {
    const family = (cf?.family ?? '').trim();
    if (!family || !Array.isArray(cf?.faces)) continue;

    for (const face of cf.faces) {
      if (!face?.filename) continue;
      const url = mediaUrl(face.filename);
      const key = `${family}::${url}`;
      if (registered.has(key)) continue;
      registered.add(key);

      try {
        const ff = new FontFace(family, `url("${url}")`, {
          weight: String(face.weight ?? 400),
          style: face.style === 'italic' ? 'italic' : 'normal',
          display: 'swap',
        });
        ff.load()
          .then((loaded) => document.fonts.add(loaded))
          .catch((err) => {
            registered.delete(key);
            console.warn('[registerStudioCustomFonts] load failed', { family, url, err });
          });
      } catch (err) {
        registered.delete(key);
        console.warn('[registerStudioCustomFonts] FontFace constructor failed', {
          family,
          err,
        });
      }
    }
  }
}
