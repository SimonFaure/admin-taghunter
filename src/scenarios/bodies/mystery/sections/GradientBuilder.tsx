/**
 * Visual builder for the `gauge_filling` CSS gradient.
 *
 * Internally manages an ordered list of `{ hex, alpha, position }` stops and
 * serializes them as `linear-gradient(90deg, rgba(...) X%, ...)`. Two-way
 * sync with the parent's string value: parses incoming value into stops,
 * emits a fresh CSS string on every change.
 *
 * Falls back to a raw CSS textarea when the input can't be parsed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Stop {
  hex: string; // e.g. "#ffc700"
  alpha: number; // 0..1
  position: number; // 0..100
}

interface GradientBuilderProps {
  value: string;
  onChange: (next: string) => void;
}

const DEFAULT_STOPS: Stop[] = [
  { hex: '#ffc700', alpha: 1, position: 0 },
  { hex: '#fee300', alpha: 1, position: 100 },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function stopToCss(s: Stop): string {
  const rgb = hexToRgb(s.hex);
  if (!rgb) return '';
  const a = clamp(s.alpha, 0, 1);
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a}) ${clamp(s.position, 0, 100)}%`;
}

function stopsToCss(stops: Stop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map(stopToCss).filter(Boolean);
  if (parts.length === 0) return '';
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/**
 * Parse a CSS gradient string into stops. Returns null on any failure (the
 * caller falls back to raw-text mode). Recognizes:
 *   linear-gradient([angle,] color [pos], color [pos], ...)
 * Color: #rgb, #rrggbb, rgb(...), rgba(...). Position: N%.
 */
function parseGradient(input: string): Stop[] | null {
  const text = input.trim();
  if (!text) return null;
  const m = /^linear-gradient\s*\(([^)]+(?:\([^)]*\)[^)]*)*)\)$/i.exec(text);
  if (!m) return null;
  const inner = m[1];

  // Split on commas that are NOT inside parentheses.
  const tokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push(buf.trim());

  // First token may be the angle (e.g. "90deg"). Skip if no color.
  const colorTokens = tokens[0]?.match(/^-?\d+(\.\d+)?(deg|rad|turn|grad)$|^to\s+/i)
    ? tokens.slice(1)
    : tokens;

  if (colorTokens.length === 0) return null;

  const stops: Stop[] = [];
  colorTokens.forEach((tok, idx) => {
    let hex = '';
    let alpha = 1;
    let position = (idx / Math.max(1, colorTokens.length - 1)) * 100;

    const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(tok);
    if (rgba) {
      hex = rgbToHex(parseInt(rgba[1], 10), parseInt(rgba[2], 10), parseInt(rgba[3], 10));
      alpha = rgba[4] !== undefined ? clamp(parseFloat(rgba[4]), 0, 1) : 1;
    } else {
      const h = tok.match(/#([a-f0-9]{3,8})\b/i);
      if (h) hex = `#${h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1].slice(0, 6)}`;
    }

    if (!hex) return;

    const posMatch = tok.match(/(-?[\d.]+)\s*%/);
    if (posMatch) position = clamp(parseFloat(posMatch[1]), 0, 100);

    stops.push({ hex, alpha, position });
  });

  return stops.length > 0 ? stops : null;
}

export function GradientBuilder({ value, onChange }: GradientBuilderProps) {
  const initialParsed = useMemo(() => parseGradient(value), []); // intentional: only on mount
  const [stops, setStops] = useState<Stop[]>(initialParsed ?? DEFAULT_STOPS);
  const [rawMode, setRawMode] = useState(initialParsed === null && value.trim().length > 0);
  const [rawValue, setRawValue] = useState(value);

  // When the parent value changes externally (e.g. on load), re-parse.
  useEffect(() => {
    if (rawMode) {
      setRawValue(value);
      return;
    }
    const parsed = parseGradient(value);
    if (parsed) setStops(parsed);
  }, [value, rawMode]);

  function updateStops(next: Stop[]) {
    setStops(next);
    onChange(stopsToCss(next));
  }

  function setStop(i: number, patch: Partial<Stop>) {
    updateStops(stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addStop() {
    const lastPos = stops.length > 0 ? stops[stops.length - 1].position : 0;
    const nextPos = clamp(lastPos + 25, 0, 100);
    updateStops([...stops, { hex: '#ffffff', alpha: 1, position: nextPos }]);
  }

  function removeStop(i: number) {
    if (stops.length <= 1) return;
    updateStops(stops.filter((_, idx) => idx !== i));
  }

  function enterRawMode() {
    setRawValue(stopsToCss(stops));
    setRawMode(true);
  }

  function leaveRawMode() {
    const parsed = parseGradient(rawValue);
    if (parsed) {
      setStops(parsed);
      onChange(stopsToCss(parsed));
      setRawMode(false);
    }
  }

  const previewCss = rawMode ? rawValue || 'linear-gradient(90deg, transparent, transparent)' : stopsToCss(stops);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      {/* Live preview */}
      <div
        className="h-8 rounded border border-gray-300 mb-3"
        style={{ background: previewCss }}
      />

      {rawMode ? (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-700 block">
            Raw CSS gradient
          </span>
          <textarea
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.target.value);
              onChange(e.target.value);
            }}
            rows={2}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={leaveRawMode}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
            >
              Parse into stops
            </button>
            <span className="text-[11px] text-gray-500">
              (or keep editing raw CSS)
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="color"
                  value={s.hex}
                  onChange={(e) => setStop(i, { hex: e.target.value })}
                  className="col-span-2 h-8 w-full rounded border border-gray-300 cursor-pointer"
                  aria-label="Stop color"
                />
                <label className="col-span-4 text-xs text-gray-600 flex items-center gap-1">
                  <span>Alpha</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={s.alpha}
                    onChange={(e) => setStop(i, { alpha: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-8 text-right tabular-nums">{s.alpha.toFixed(2)}</span>
                </label>
                <label className="col-span-4 text-xs text-gray-600 flex items-center gap-1">
                  <span>Pos</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={s.position}
                    onChange={(e) =>
                      setStop(i, { position: clamp(parseFloat(e.target.value) || 0, 0, 100) })
                    }
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                  />
                  <span className="text-gray-500">%</span>
                </label>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  disabled={stops.length <= 1}
                  className="col-span-2 p-1.5 hover:bg-red-50 rounded text-red-500 disabled:opacity-30 justify-self-end"
                  aria-label="Remove stop"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={addStop}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add stop
            </button>
            <button
              type="button"
              onClick={enterRawMode}
              className="text-xs px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
            >
              Edit raw CSS
            </button>
          </div>
        </>
      )}
    </div>
  );
}
