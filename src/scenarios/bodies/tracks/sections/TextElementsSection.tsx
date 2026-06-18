/**
 * Text elements section — author-defined categories grouping translatable
 * text overlays. Content + grouping live here; typography (font / color /
 * B / I / U / align / shadow / background) moved to the LayoutEditor in the
 * categories refactor.
 *
 * Layout:
 *   ┌─ Text elements (N) ─────────────────── [+ Add category] ─┐
 *   │  ┌─ Category card ─────────────────────────────────────┐ │
 *   │  │ [▼ name-input  count  ↑ ↓ × ]                       │ │
 *   │  │   element row (text input + cat dropdown + ↑↓×)     │ │
 *   │  │   [+ Add element]                                   │ │
 *   │  └─────────────────────────────────────────────────────┘ │
 *   │  ... more category cards ...                              │
 *   │  ┌─ Uncategorized (always last, no rename/delete) ─────┐ │
 *   │  │   ...                                               │ │
 *   │  └─────────────────────────────────────────────────────┘ │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Plan: C:\Users\faure\.claude\plans\tracks-text-elements-categories.md
 */

import { Fragment, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { TextCategory, TextElement } from '../../../../types/scenario-data';
import { TEXT_ELEMENT_DEFAULT_ALIGN } from '../textElementStyle';

/** Sentinel value used by the category <select> for "Uncategorized". */
const UNCATEGORIZED_VALUE = '';

function uuid(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newTextElement(categoryId: string | undefined): TextElement {
  return {
    id: uuid('te'),
    text: {},
    align: TEXT_ELEMENT_DEFAULT_ALIGN,
    ...(categoryId ? { category: categoryId } : {}),
    // typography fields + position deliberately omitted — inherit + unplaced
  };
}

function newCategory(name: string): TextCategory {
  return { id: uuid('cat'), name, typography: {} };
}

export function TextElementsSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const meta = editor.gameMeta as Record<string, unknown>;
  const elements = (meta.text_elements ?? []) as TextElement[];
  const categories = (meta.text_categories ?? []) as TextCategory[];

  // Local UI state — which category cards are collapsed. Defaults to all
  // expanded so the author sees their content on open; collapses are
  // per-category and don't persist (purely UI ergonomics).
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const toggleCollapsed = (catId: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });

  /* ── element mutations ────────────────────────────────────────────────── */

  function setElements(next: TextElement[]) {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), text_elements: next }) as typeof m,
    );
  }

  function addElement(categoryId: string | undefined) {
    setElements([...elements, newTextElement(categoryId)]);
  }

  function removeElement(idx: number) {
    setElements(elements.filter((_, i) => i !== idx));
  }

  function updateElement(idx: number, patch: Partial<TextElement>) {
    setElements(elements.map((el, i) => (i === idx ? { ...el, ...patch } : el)));
  }

  /**
   * Move an element up/down WITHIN its category. Operates on the flat
   * `text_elements[]` array but skips over elements belonging to other
   * categories — visually the element jumps over its same-category
   * neighbour, ignoring interlopers in the flat array between them.
   */
  function moveElementInCategory(idx: number, direction: -1 | 1) {
    const el = elements[idx];
    const catKey = el.category ?? '';
    let target = idx + direction;
    while (
      target >= 0 &&
      target < elements.length &&
      (elements[target].category ?? '') !== catKey
    ) {
      target += direction;
    }
    if (target < 0 || target >= elements.length) return;
    const next = [...elements];
    [next[idx], next[target]] = [next[target], next[idx]];
    setElements(next);
  }

  /* ── category mutations ───────────────────────────────────────────────── */

  function setCategories(next: TextCategory[]) {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), text_categories: next }) as typeof m,
    );
  }

  function addCategory() {
    const n = categories.length + 1;
    setCategories([...categories, newCategory(`Category ${n}`)]);
  }

  function renameCategory(idx: number, name: string) {
    setCategories(categories.map((c, i) => (i === idx ? { ...c, name } : c)));
  }

  function moveCategory(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[idx], next[target]] = [next[target], next[idx]];
    setCategories(next);
  }

  /**
   * Delete a category and cascade — every element that referenced it loses
   * its `category` field and lands in Uncategorized. Element overrides and
   * positions survive intact. Confirmation handled inline (browser confirm).
   */
  function deleteCategory(idx: number) {
    const cat = categories[idx];
    if (!cat) return;
    const elementCount = elements.filter((e) => e.category === cat.id).length;
    const msg =
      elementCount > 0
        ? `Delete category "${cat.name}"? Its ${elementCount} element${
            elementCount === 1 ? '' : 's'
          } will move to Uncategorized.`
        : `Delete category "${cat.name}"?`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    setCategories(categories.filter((_, i) => i !== idx));
    if (elementCount > 0) {
      setElements(
        elements.map((e) => {
          if (e.category !== cat.id) return e;
          const { category: _drop, ...rest } = e;
          return rest;
        }),
      );
    }
  }

  /* ── render-time pivot ────────────────────────────────────────────────── */

  const uncategorizedElements = elements
    .map((el, idx) => ({ el, idx }))
    .filter((e) => !e.el.category);
  const elementsByCatId = new Map<string, { el: TextElement; idx: number }[]>();
  for (const cat of categories) elementsByCatId.set(cat.id, []);
  elements.forEach((el, idx) => {
    if (el.category && elementsByCatId.has(el.category)) {
      elementsByCatId.get(el.category)!.push({ el, idx });
    }
  });

  // Options for the per-element category <select>. Stable order across
  // renders so the picker doesn't jump around.
  const categoryOptions = [
    { value: UNCATEGORIZED_VALUE, label: 'Uncategorized' },
    ...categories.map((c) => ({ value: c.id, label: c.name || '(unnamed)' })),
  ];

  /** Renders one category card (real category OR the Uncategorized bucket). */
  function CategoryCard({
    catId,
    name,
    catIdx,
    rows,
    readOnly,
  }: {
    catId: string | undefined; // undefined → Uncategorized
    name: string;
    catIdx: number; // -1 for Uncategorized
    rows: { el: TextElement; idx: number }[];
    readOnly: boolean;
  }) {
    const collapseKey = catId ?? '__uncategorized__';
    const collapsed = collapsedCats.has(collapseKey);
    return (
      <div className="border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => toggleCollapsed(collapseKey)}
            className="p-0.5 text-gray-500 hover:text-gray-700"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {readOnly ? (
            <span className="text-sm font-semibold text-gray-700 italic">{name}</span>
          ) : (
            <input
              value={name}
              onChange={(e) => renameCategory(catIdx, e.target.value)}
              placeholder="Category name"
              className="text-sm font-semibold text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-gray-500 outline-none px-1 py-0.5 flex-1 min-w-0"
            />
          )}
          <span className="text-xs text-gray-500 flex-shrink-0">
            {rows.length} element{rows.length === 1 ? '' : 's'}
          </span>
          {!readOnly && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => moveCategory(catIdx, -1)}
                disabled={catIdx === 0}
                className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30"
                aria-label="Move category up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => moveCategory(catIdx, 1)}
                disabled={catIdx === categories.length - 1}
                className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30"
                aria-label="Move category down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deleteCategory(catIdx)}
                className="p-1 hover:bg-red-50 rounded text-red-500"
                aria-label="Delete category"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="p-3 space-y-2">
            {rows.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                No elements in this category yet.
              </p>
            ) : (
              rows.map(({ el, idx }, rowPos) => (
                // Rendered as an inlined call (not <ElementRow/>) so the section
                // re-render on each keystroke doesn't remount the input and drop
                // focus. ElementRow uses no hooks — safe to call directly.
                <Fragment key={el.id ?? idx}>
                  {ElementRow({ el, flatIdx: idx, rowPos, rowsLen: rows.length })}
                </Fragment>
              ))
            )}
            <div className="pt-1">
              <button
                onClick={() => addElement(catId)}
                className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add element
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /** Renders one element row inside a category card. */
  function ElementRow({
    el,
    flatIdx,
    rowPos,
    rowsLen,
  }: {
    el: TextElement;
    flatIdx: number;
    rowPos: number;
    rowsLen: number;
  }) {
    const textValue = getLocalized(el.text as never, lang, defaultLang);
    const placed = !!el.position;
    return (
      <div className="flex items-start gap-2 p-2 border border-gray-200 rounded bg-white">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            onClick={() => moveElementInCategory(flatIdx, -1)}
            disabled={rowPos === 0}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => moveElementInCategory(flatIdx, 1)}
            disabled={rowPos === rowsLen - 1}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <textarea
            rows={1}
            value={textValue}
            onChange={(ev) =>
              updateElement(flatIdx, {
                text: setLocalized(el.text as never, lang, ev.target.value, defaultLang),
              })
            }
            placeholder={`Text (${lang})`}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-600">Category</label>
            <select
              value={el.category ?? UNCATEGORIZED_VALUE}
              onChange={(ev) => {
                const v = ev.target.value;
                updateElement(flatIdx, {
                  category: v === UNCATEGORIZED_VALUE ? undefined : v,
                });
              }}
              className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value || '__unc'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                placed
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {placed ? 'placed' : 'unplaced'}
            </span>
          </div>
        </div>
        <button
          onClick={() => removeElement(flatIdx)}
          className="p-1 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
          aria-label="Remove element"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <CollapsibleSection
      title={`Text elements (${elements.length})`}
      defaultCollapsed
      headerExtra={
        <button
          onClick={addCategory}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add category
        </button>
      }
    >
      <p className="text-xs text-gray-500 mb-3">
        Categories group text elements + define their typography defaults (font, color,
        bold / italic / underline, align, shadow, background). Typography is edited in
        the layout editor; per-element overrides win per field.
      </p>
      <div className="space-y-3">
        {categories.map((cat, idx) => (
          <Fragment key={cat.id}>
            {CategoryCard({
              catId: cat.id,
              name: cat.name,
              catIdx: idx,
              rows: elementsByCatId.get(cat.id) ?? [],
              readOnly: false,
            })}
          </Fragment>
        ))}
        {CategoryCard({
          catId: undefined,
          name: 'Uncategorized',
          catIdx: -1,
          rows: uncategorizedElements,
          readOnly: true,
        })}
      </div>
    </CollapsibleSection>
  );
}
