import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Floating "Sections" jump-menu for the scenario editor. Reads the rendered
 * section anchors (`section[id][data-section-title]` - written by every
 * `CollapsibleSection`), lets the operator smooth-scroll to any of them.
 *
 * Re-scans the DOM when the menu opens, so it picks up game-type body sections
 * that mount asynchronously after the scenario loads.
 */
export function SectionsTOC() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; title: string }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    const next: Array<{ id: string; title: string }> = [];
    document
      .querySelectorAll<HTMLElement>('main section[id][data-section-title]')
      .forEach((el) => {
        const id = el.id;
        const title = (el.getAttribute('data-section-title') ?? '').trim();
        if (id && title) next.push({ id, title });
      });
    setItems(next);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Close when clicking outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="fixed top-24 right-6 z-40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('scenarioPreview:toc.jumpToSection')}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-sm text-gray-700"
      >
        <List className="w-4 h-4 text-gray-500" />
        <span>{t('scenarioPreview:toc.sections')}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>
      {open && (
        <ul className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[70vh] overflow-y-auto py-1 min-w-[200px]">
          {items.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-gray-400">{t('scenarioPreview:toc.noSections')}</li>
          ) : (
            items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {s.title}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
