/**
 * "What is left to do" for one scenario - the detail behind a row of the
 * Scenario overview.
 *
 * Lists only what is missing unless "Show completed" is on. Critical items
 * (publish-validator errors) come first, then one section per group, the
 * translations split per target language, and a collapsed, never-counted
 * "Optional, not provided" section at the bottom.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, Loader2, X } from 'lucide-react';
import { LANGUAGES } from '../../i18n/languages';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  type ChecklistGroup,
  type ChecklistItem,
  type ScenarioOverview,
} from './scenarioOverviewModel';

/** How many detail lines (e.g. untranslated texts) an item shows before "and N more". */
const DETAIL_CAP = 20;

interface Props {
  overview: ScenarioOverview;
  /** Scroll to this group on open (the chip that was clicked). */
  focusGroup?: ChecklistGroup;
  gameTypeLabel: string;
  busy: boolean;
  onToggleFinished: () => void;
  onOpenEditor: () => void;
  onClose: () => void;
}

function ItemRow({ item }: { item: ChecklistItem }) {
  const details = item.ok ? [] : (item.details ?? []);
  return (
    <li className="flex items-start gap-2 py-1">
      {item.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
      ) : item.critical ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <span className={`text-sm ${item.ok ? 'text-slate-400' : 'text-slate-800'}`}>{item.label}</span>
        {details.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
            {details.slice(0, DETAIL_CAP).map((d, i) => (
              <li key={i} className="break-words">
                {d}
              </li>
            ))}
            {details.length > DETAIL_CAP && <li>and {details.length - DETAIL_CAP} more</li>}
          </ul>
        )}
      </div>
    </li>
  );
}

export function ScenarioChecklistModal({
  overview: o,
  focusGroup,
  gameTypeLabel,
  busy,
  onToggleFinished,
  onOpenEditor,
  onClose,
}: Props) {
  const s = o.scenario;
  const [showDone, setShowDone] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const sectionRefs = useRef<Partial<Record<ChecklistGroup, HTMLElement | null>>>({});

  useEffect(() => {
    if (focusGroup) sectionRefs.current[focusGroup]?.scrollIntoView({ block: 'start' });
    // Only on open: the list re-renders when an item is ticked off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finished = !!s.finished_at;
  const critical = o.todo.filter((i) => i.critical);
  const shown = (items: ChecklistItem[]) => (showDone ? items : items.filter((i) => !i.ok));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`What is left to do on ${s.title}`}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 break-words">{s.title || '(untitled)'}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {gameTypeLabel} · {LANGUAGES[o.sourceLang]?.englishName ?? o.sourceLang}
              {o.product &&
                (o.targets.length > 0
                  ? ` · also available in ${o.targets.map((l) => LANGUAGES[l]?.englishName ?? l).join(', ')}`
                  : ` · available in ${LANGUAGES[o.sourceLang]?.englishName ?? o.sourceLang} only`)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className={`text-sm font-medium ${o.todo.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {o.todo.length > 0
              ? `${o.todo.length} ${o.todo.length === 1 ? 'item' : 'items'} left of ${o.items.length}`
              : 'Nothing left to do'}
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show completed
          </label>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {critical.length > 0 && (
            <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-rose-800">Critical ({critical.length})</h3>
              <p className="text-xs text-rose-700">The game cannot run correctly without these.</p>
              <ul className="mt-1">
                {critical.map((item, i) => (
                  <ItemRow key={i} item={item} />
                ))}
              </ul>
            </section>
          )}

          {GROUP_ORDER.map((group) => {
            const count = o.groups[group];
            if (count.total === 0) return null;
            // Missing critical items are listed once, in the block above.
            const items = shown(o.items.filter((i) => i.group === group && (i.ok || !i.critical)));
            const allDone = count.done >= count.total;
            return (
              <section
                key={group}
                ref={(el) => {
                  sectionRefs.current[group] = el;
                }}
                className="scroll-mt-2"
              >
                <h3 className="flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span>{GROUP_LABELS[group]}</span>
                  <span className={`tabular-nums ${allDone ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {count.done}/{count.total}
                  </span>
                </h3>
                {items.length === 0 ? (
                  <p className="py-1 text-sm text-slate-400">
                    {allDone ? 'All done.' : 'Only critical items are missing (listed above).'}
                  </p>
                ) : group === 'translations' ? (
                  o.targets.map((lang) => {
                    const forLang = items.filter((i) => i.lang === lang);
                    if (forLang.length === 0) return null;
                    return (
                      <div key={lang} className="mt-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {LANGUAGES[lang]?.englishName ?? lang}
                        </p>
                        <ul>
                          {forLang.map((item, i) => (
                            <ItemRow key={i} item={item} />
                          ))}
                        </ul>
                      </div>
                    );
                  })
                ) : (
                  <ul>
                    {items.map((item, i) => (
                      <ItemRow key={i} item={item} />
                    ))}
                  </ul>
                )}

                {group === 'documents' && o.documentList.length > 0 && showDone && (
                  <div className="mt-1 text-xs text-slate-500">
                    <p className="font-semibold">Attached files</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {o.documentList.map((d, i) => (
                        <li key={i} className="break-words">
                          {d.name} - {d.typeLabel} <span className="uppercase">({d.langs.join(', ')})</span>
                          {d.noTranslation && ' - no translation needed'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}

          {o.brokenFiles.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-amber-800">Files not found on the server</h3>
              <p className="text-xs text-amber-700">
                The scenario references these files but they are gone, so they count as missing:{' '}
                {o.brokenFiles.join(', ')}
              </p>
            </section>
          )}

          {o.optional.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                aria-expanded={showOptional}
                className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                {showOptional ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Optional, not provided ({o.optional.length})
              </button>
              {showOptional && (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-500">
                  {o.optional.map((label, i) => (
                    <li key={i}>{label}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open in the editor
          </button>
          {o.product && (
            <button
              type="button"
              onClick={onToggleFinished}
              disabled={busy}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
                finished
                  ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {finished ? 'Reopen (not finished)' : 'Mark as finished'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
