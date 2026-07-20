/**
 * Shared, presentational Tag Hunter GO preview - the "correspondance images ↔
 * réponse" sheet: each enigma with its printed short code and, per answer letter
 * (A/B or A/B/C/D), the image that sits behind it, the correct one highlighted.
 *
 * Used by BOTH the admin editor modal (GoPreviewModal) and the client scenario
 * details page, so it takes already-resolved data (image URLs) and stays free of
 * any editor/DB context. Images render small on screen; "Print / PDF" opens a
 * clean printable sheet (the browser's print dialog offers Save as PDF).
 */

import { Check, Printer } from 'lucide-react';

export interface GoPreviewAnswer {
  letter: string;
  correct: boolean;
  imageUrl: string | null;
}

export interface GoPreviewEnigma {
  number: string;
  short_code: string;
  answers: GoPreviewAnswer[];
}

interface Props {
  title?: string;
  answerCount: 2 | 4;
  enigmas: GoPreviewEnigma[];
  /** e.g. 'no_pattern_bound' - shown as a gentle caveat. */
  warning?: string | null;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/**
 * Open a clean print window with the preview and trigger the print dialog once
 * the answer images have loaded. The user can pick a printer or "Save as PDF".
 */
export function printGoPreview(title: string, answerCount: 2 | 4, enigmas: GoPreviewEnigma[]) {
  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) return;
  const cols = answerCount === 4 ? 4 : 2;
  const cards = enigmas
    .map(
      (e) => `
      <div class="enigma">
        <div class="head">
          <span class="num">${esc(e.number)}</span>
          <span class="code">${esc(e.short_code || '-')}</span>
        </div>
        <div class="answers">
          ${e.answers
            .map(
              (a) => `
            <div class="ans${a.correct ? ' correct' : ''}">
              <div class="letter">${esc(a.letter)}${a.correct ? ' ✓' : ''}</div>
              ${
                a.imageUrl
                  ? `<img src="${esc(a.imageUrl)}" alt="${esc(a.letter)}" />`
                  : `<div class="noimg">-</div>`
              }
            </div>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
    <title>${esc(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .enigma { border: 1px solid #d4d4d8; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
      .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .num { font-weight: 700; font-size: 13px; }
      .code { font-family: ui-monospace, monospace; letter-spacing: 2px; background: #111; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
      .answers { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 10px; }
      .ans { border: 2px solid #e4e4e7; border-radius: 8px; padding: 6px; }
      .ans.correct { border-color: #10b981; background: #ecfdf5; }
      .letter { font-weight: 800; font-size: 13px; margin-bottom: 4px; }
      .ans img { width: 100%; height: 120px; object-fit: contain; background: #f4f4f5; border-radius: 4px; }
      .noimg { height: 120px; display: flex; align-items: center; justify-content: center; color: #a1a1aa; background: #f4f4f5; border-radius: 4px; }
      @page { margin: 12mm; }
    </style></head>
    <body>
      <h1>${esc(title)}</h1>
      ${cards}
      <script>
        (function(){
          function go(){ try { window.focus(); window.print(); } catch(e){} }
          var imgs = document.images, n = imgs.length, c = 0;
          if (!n) { setTimeout(go, 200); return; }
          function done(){ if (++c >= n) setTimeout(go, 150); }
          for (var i=0;i<n;i++){ if (imgs[i].complete) done(); else { imgs[i].onload = imgs[i].onerror = done; } }
        })();
      </script>
    </body></html>`);
  w.document.close();
}

export function GoPreviewContent({ title, answerCount, enigmas, warning }: Props) {
  const lettersLabel = answerCount === 4 ? 'A / B / C / D' : 'A / B';

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {lettersLabel} · {enigmas.length} {enigmas.length === 1 ? 'enigma' : 'enigmas'}
          {warning === 'no_pattern_bound' && (
            <span className="ml-2 text-amber-600">· no GO pattern bound (defaults to A)</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => printGoPreview(title || 'GO preview', answerCount, enigmas)}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          <Printer className="w-4 h-4" />
          Print / PDF
        </button>
      </div>

      {enigmas.length === 0 ? (
        <p className="text-sm text-gray-500">No enigmas yet.</p>
      ) : (
        <div className="space-y-4">
          {enigmas.map((e, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">Enigma {e.number}</span>
                <span className="rounded bg-gray-900 px-2 py-0.5 font-mono text-xs tracking-widest text-white">
                  {(e.short_code || '-').toUpperCase()}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {e.answers.map((a) => (
                  <div
                    key={a.letter}
                    className={`w-24 rounded-lg border-2 p-1.5 ${
                      a.correct ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-extrabold text-gray-800">{a.letter}</span>
                      {a.correct && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                    <div className="aspect-square w-full overflow-hidden rounded bg-gray-100">
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt={a.letter} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                          no image
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
