/**
 * Typography editor — shared 8-field form used in the LayoutEditor sidebar:
 *
 *   - `mode='category'` — edits a `TextCategoryTypography`. The font picker
 *     has a "— Scenario default —" option (clear → inherit scenario font);
 *     the color has a "Custom color" toggle; booleans/align are stored as
 *     explicit values (no inherit toggle).
 *
 *   - `mode='element'` — edits a `TextElement`'s per-field overrides over a
 *     RESOLVED category typography. Each of the 8 fields has its own
 *     [Override] checkbox: OFF → field disabled, displays the inherited
 *     value from `inheritedFrom`; ON → field active, author edits the
 *     element value.
 *
 * Plan: C:\Users\faure\.claude\plans\tracks-text-elements-categories.md
 */

import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import type { CustomFont, TextCategoryTypography } from '../../../types/scenario-data';
import { FONT_CATALOG } from '../../../fonts/catalog';
import { TEXT_ELEMENT_DEFAULT_ALIGN } from './textElementStyle';

export interface TypographyEditorProps {
  /** Current typography being edited (always an object, fields all optional). */
  value: TextCategoryTypography;
  onChange: (next: TextCategoryTypography) => void;
  mode: 'category' | 'element';
  /**
   * Resolved fallback typography:
   *   - `mode='element'`: resolved category typography (with scenario
   *     ultimately backing it). Shown as the inherited value when a field's
   *     Override toggle is off.
   *   - `mode='category'`: the scenario's typography (just font + font_color
   *     are populated; the rest fall back to defaults). Not displayed as
   *     "inherit", but used to render previews where helpful.
   */
  inheritedFrom: ResolvedTypography;
  /** Per-scenario custom fonts (passed through to the font picker). */
  customFonts: readonly CustomFont[];
}

/**
 * Fully resolved typography — every field has a concrete value. Used for
 * displaying the inherited value next to an OFF [Override] toggle, and as
 * the starting point when the author flips a toggle ON.
 */
export interface ResolvedTypography {
  font: string;       // '' = none / scenario default
  font_color: string; // hex
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  background: boolean;
}

/**
 * Resolve a typography spec by walking the chain:
 *   element override (if set) → category (if set) → scenario defaults.
 *
 * Used by both the LayoutEditor (for the inline preview + the inherit-base)
 * and the playground runtime (mirror this in slice C).
 */
export function resolveTypography(args: {
  element?: TextCategoryTypography;
  category?: TextCategoryTypography;
  scenarioFont: string;
  scenarioFontColor: string;
}): ResolvedTypography {
  const { element, category, scenarioFont, scenarioFontColor } = args;
  const pick = <K extends keyof TextCategoryTypography>(key: K, fallback: NonNullable<TextCategoryTypography[K]>): NonNullable<TextCategoryTypography[K]> => {
    if (element && element[key] !== undefined) return element[key] as NonNullable<TextCategoryTypography[K]>;
    if (category && category[key] !== undefined) return category[key] as NonNullable<TextCategoryTypography[K]>;
    return fallback;
  };
  return {
    font: pick('font', scenarioFont || ''),
    font_color: pick('font_color', scenarioFontColor || '#ffffff'),
    bold: pick('bold', false),
    italic: pick('italic', false),
    underline: pick('underline', false),
    align: pick('align', TEXT_ELEMENT_DEFAULT_ALIGN),
    shadow: pick('shadow', false),
    background: pick('background', false),
  };
}

/* ── small UI helpers ─────────────────────────────────────────────────── */

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 mb-2">{children}</div>;
}

function FieldLabel({ text }: { text: string }) {
  return (
    <span className="text-[11px] font-medium text-gray-300 w-16 flex-shrink-0">
      {text}
    </span>
  );
}

function OverrideCheckbox({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={on}
      onChange={(e) => onToggle(e.target.checked)}
      title={on ? 'Override on — element wins' : 'Inherit from category'}
      className="rounded flex-shrink-0"
    />
  );
}

/* ── the component ────────────────────────────────────────────────────── */

export function TypographyEditor({
  value,
  onChange,
  mode,
  inheritedFrom,
  customFonts,
}: TypographyEditorProps) {
  const set = <K extends keyof TextCategoryTypography>(
    key: K,
    v: TextCategoryTypography[K],
  ) => onChange({ ...value, [key]: v });

  const clear = (key: keyof TextCategoryTypography) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const isElementMode = mode === 'element';

  // True iff the element has an explicit value for this field. In category
  // mode, this drives nothing (every category field is just edit-or-clear).
  const overrides = {
    font: value.font !== undefined,
    font_color: value.font_color !== undefined,
    bold: value.bold !== undefined,
    italic: value.italic !== undefined,
    underline: value.underline !== undefined,
    align: value.align !== undefined,
    shadow: value.shadow !== undefined,
    background: value.background !== undefined,
  } as const;

  const handleToggleOverride = <K extends keyof TextCategoryTypography>(
    key: K,
    on: boolean,
  ) => {
    if (on) set(key, inheritedFrom[key as keyof ResolvedTypography] as TextCategoryTypography[K]);
    else clear(key);
  };

  // For 'element' mode the displayed select/input value: element value when
  // overriding, otherwise the resolved category value (read-only display).
  const dispFont = isElementMode && !overrides.font ? inheritedFrom.font : (value.font ?? '');
  const dispColor = isElementMode && !overrides.font_color
    ? inheritedFrom.font_color
    : (value.font_color ?? inheritedFrom.font_color);
  const dispBold = isElementMode && !overrides.bold ? inheritedFrom.bold : !!value.bold;
  const dispItalic = isElementMode && !overrides.italic ? inheritedFrom.italic : !!value.italic;
  const dispUnderline = isElementMode && !overrides.underline
    ? inheritedFrom.underline
    : !!value.underline;
  const dispAlign = isElementMode && !overrides.align
    ? inheritedFrom.align
    : (value.align ?? TEXT_ELEMENT_DEFAULT_ALIGN);
  const dispShadow = isElementMode && !overrides.shadow ? inheritedFrom.shadow : !!value.shadow;
  const dispBackground = isElementMode && !overrides.background
    ? inheritedFrom.background
    : !!value.background;

  /* Font catalog options */
  const customFamilies = customFonts.map((f) => f.family).filter(Boolean);
  const standard = FONT_CATALOG.filter((f) => f.group === 'standard');
  const themed = FONT_CATALOG.filter((f) => f.group === 'themed');

  /* Category-mode color uses a separate "Custom color" toggle since the
     color picker has no natural blank state. Element-mode uses the field's
     Override checkbox instead. */
  const categoryColorActive = overrides.font_color;

  return (
    <div className="bg-gray-950 border border-gray-800 rounded p-2 mt-2">
      {/* Font */}
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.font}
            onToggle={(on) => handleToggleOverride('font', on)}
          />
        )}
        <FieldLabel text="Font" />
        <select
          value={dispFont}
          disabled={isElementMode && !overrides.font}
          onChange={(e) => set('font', e.target.value || undefined)}
          className="flex-1 min-w-0 text-xs px-1.5 py-1 border border-gray-700 rounded bg-gray-900 text-gray-200 disabled:opacity-60"
        >
          {!isElementMode && (
            <option value="">— Scenario default —</option>
          )}
          <optgroup label="Standard">
            {standard.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Themed">
            {themed.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                {f.label}
              </option>
            ))}
          </optgroup>
          {customFamilies.length > 0 && (
            <optgroup label="Custom fonts">
              {customFamilies.map((c) => (
                <option key={c} value={c} style={{ fontFamily: `"${c}", sans-serif` }}>
                  {c}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Row>

      {/* Color */}
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.font_color}
            onToggle={(on) => handleToggleOverride('font_color', on)}
          />
        )}
        <FieldLabel text="Color" />
        <input
          type="color"
          value={dispColor || '#000000'}
          disabled={isElementMode ? !overrides.font_color : !categoryColorActive}
          onChange={(e) => set('font_color', e.target.value)}
          className="h-7 w-12 border border-gray-700 rounded disabled:opacity-60"
        />
        {!isElementMode && (
          <label className="inline-flex items-center gap-1 text-[11px] text-gray-400 ml-1">
            <input
              type="checkbox"
              checked={categoryColorActive}
              onChange={(e) => {
                if (e.target.checked) set('font_color', value.font_color ?? inheritedFrom.font_color ?? '#ffffff');
                else clear('font_color');
              }}
              className="rounded"
            />
            Custom
          </label>
        )}
      </Row>

      {/* B / I / U */}
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.bold || overrides.italic || overrides.underline}
            onToggle={(on) => {
              // Group toggle: turning ON gives the element explicit values for
              // all three (seeded from inheritedFrom). Turning OFF clears all
              // three. This is per-character-set rather than per-character —
              // simpler than three separate toggles, still covers the use case.
              if (on) {
                onChange({
                  ...value,
                  bold: inheritedFrom.bold,
                  italic: inheritedFrom.italic,
                  underline: inheritedFrom.underline,
                });
              } else {
                const next = { ...value };
                delete next.bold;
                delete next.italic;
                delete next.underline;
                onChange(next);
              }
            }}
          />
        )}
        <FieldLabel text="Style" />
        <div className="inline-flex items-center rounded border border-gray-700 bg-gray-900 overflow-hidden">
          {([
            { key: 'bold', Icon: Bold, on: dispBold },
            { key: 'italic', Icon: Italic, on: dispItalic },
            { key: 'underline', Icon: Underline, on: dispUnderline },
          ] as const).map(({ key, Icon, on }, idx) => {
            const disabled = isElementMode && !overrides[key];
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => set(key, !on as TextCategoryTypography[typeof key])}
                aria-pressed={on}
                className={`p-1 ${idx > 0 ? 'border-l border-gray-700' : ''} ${
                  on
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                } disabled:opacity-60 disabled:hover:bg-transparent`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </Row>

      {/* Align */}
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.align}
            onToggle={(on) => handleToggleOverride('align', on)}
          />
        )}
        <FieldLabel text="Align" />
        <div className="inline-flex items-center rounded border border-gray-700 bg-gray-900 overflow-hidden">
          {([
            { key: 'left', Icon: AlignLeft },
            { key: 'center', Icon: AlignCenter },
            { key: 'right', Icon: AlignRight },
          ] as const).map(({ key, Icon }, idx) => {
            const disabled = isElementMode && !overrides.align;
            const selected = dispAlign === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => set('align', key)}
                aria-pressed={selected}
                className={`p-1 ${idx > 0 ? 'border-l border-gray-700' : ''} ${
                  selected
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                } disabled:opacity-60 disabled:hover:bg-transparent`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </Row>

      {/* Shadow / Background */}
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.shadow}
            onToggle={(on) => handleToggleOverride('shadow', on)}
          />
        )}
        <FieldLabel text="Shadow" />
        <label className="inline-flex items-center gap-1 text-[11px] text-gray-300 select-none">
          <input
            type="checkbox"
            checked={dispShadow}
            disabled={isElementMode && !overrides.shadow}
            onChange={(e) => set('shadow', e.target.checked)}
            className="rounded"
          />
          enabled
        </label>
      </Row>
      <Row>
        {isElementMode && (
          <OverrideCheckbox
            on={overrides.background}
            onToggle={(on) => handleToggleOverride('background', on)}
          />
        )}
        <FieldLabel text="BG fill" />
        <label className="inline-flex items-center gap-1 text-[11px] text-gray-300 select-none">
          <input
            type="checkbox"
            checked={dispBackground}
            disabled={isElementMode && !overrides.background}
            onChange={(e) => set('background', e.target.checked)}
            className="rounded"
          />
          enabled
        </label>
      </Row>
    </div>
  );
}
