/**
 * Typography section — font picker, custom-font uploads, and the two colors.
 *
 * `game_meta.font` holds a plain family-name string selected from the curated
 * catalog OR the scenario's uploaded `custom_fonts`. A value that matches
 * neither (legacy free-text) is preserved as its own picker entry. The chosen
 * font becomes the in-game text font (see the playground renderer).
 *
 * Plan: C:\Users\faure\.claude\plans\studio-custom-fonts-typography.md
 */

import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { CustomFontsManager } from './CustomFontsManager';
import { FONT_CATALOG } from '../../../fonts/catalog';
import { resolveFontFamily } from '../../../fonts/resolveFontFamily';
import type { CustomFont } from '../../../types/scenario-data';

const PREVIEW_TEXT = 'The quick brown fox — AaBbCc 0123';

export function TypographySection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const setKey = (k: string, v: unknown) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [k]: v }) as typeof m);

  const customFonts: CustomFont[] = Array.isArray(meta.custom_fonts)
    ? (meta.custom_fonts as CustomFont[])
    : [];
  const customFamilies = customFonts.map((f) => f.family).filter(Boolean);

  const standard = FONT_CATALOG.filter((f) => f.group === 'standard');
  const themed = FONT_CATALOG.filter((f) => f.group === 'themed');

  const fontValue = String(meta.font ?? '');
  // Every `<option>` carries an exact family string. A non-empty `font` that
  // matches no option exactly (legacy free-text, or an old differently-cased
  // value) gets its own entry so the picker shows it and saving never drops it.
  const optionValues = new Set<string>([
    ...FONT_CATALOG.map((f) => f.family),
    ...customFamilies,
  ]);
  const legacyValue = fontValue && !optionValues.has(fontValue) ? fontValue : null;

  const previewStack = resolveFontFamily(fontValue);

  return (
    <CollapsibleSection title="Typography">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Font family</span>
          <select
            value={fontValue}
            onChange={(e) => setKey('font', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">— Default —</option>
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
            {legacyValue && (
              <optgroup label="Current value">
                <option value={legacyValue}>{legacyValue} (legacy)</option>
              </optgroup>
            )}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Font color</span>
          <input
            type="color"
            value={String(meta.font_color ?? '#000000')}
            onChange={(e) => setKey('font_color', e.target.value)}
            className="w-full h-10 border border-gray-300 rounded-md"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Level font color</span>
          <input
            type="color"
            value={String(meta.level_font_color ?? '#000000')}
            onChange={(e) => setKey('level_font_color', e.target.value)}
            className="w-full h-10 border border-gray-300 rounded-md"
          />
        </label>
      </div>

      {/* Live preview of the selected font. */}
      <div className="mt-3 border border-gray-200 rounded-md px-3 py-2 bg-white">
        <span className="text-[11px] font-medium text-gray-400 block mb-0.5">Preview</span>
        <span
          className="text-lg text-gray-900"
          style={{
            fontFamily: previewStack || undefined,
            color: String(meta.font_color ?? '') || undefined,
          }}
        >
          {PREVIEW_TEXT}
        </span>
      </div>

      <div className="mt-3">
        <CustomFontsManager />
      </div>
    </CollapsibleSection>
  );
}
