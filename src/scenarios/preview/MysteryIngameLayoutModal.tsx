/**
 * Mystery in-game / idle layout editor — full-screen modal launched from the
 * Mystery scenario editor. Two authoring modes, switched by a header toggle:
 *
 *   • In-game — place the 4 in-game text roles (enigma name, timer, score, team
 *     name) over the real in-game board; each box's dimensions drive its font
 *     size (long team names shrink to fit). Stored at `gameMeta.ingame_layout`.
 *   • Idle — place up to two fully styled text elements (scenario title +
 *     subtitle) over the background. This is the screen the playground shows
 *     between teams when "reveal results on Enter/click" is off. Each element
 *     carries its own font / explicit size / color and is independently
 *     togg-able. Stored at `gameMeta.idle_layout`.
 *
 * Reads live in-memory `gameMeta` via `useScenarioEditor` and writes positions
 * back, so changes persist through the normal Save flow and sync to the
 * playground. The board/background behind the draggable boxes is the real
 * `MysteryPreviewRenderer` (with its own text overlays hidden) so the author
 * sees exactly what the playground will show.
 *
 * Plan: C:\Users\faure\.claude\plans\giggly-weaving-gosling.md
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCcw, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { getLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import { FONT_CATALOG } from '../../fonts/catalog';
import type { CustomFont } from '../../types/scenario-data';
import {
  MysteryPreviewRenderer,
  IDLE_SUBTITLE_SAMPLE,
  type PreviewMysteryGameMeta,
} from './MysteryPreviewRenderer';
import {
  INGAME_ROLES,
  IDLE_ROLES,
  MysteryLayoutBox,
  MysteryIdleBox,
  resolveIngameLayout,
  resolveIdleLayout,
  type IngameAlign,
  type IngameBox,
  type IngameLayout,
  type IngameRoleKey,
  type IdleElement,
  type IdleLayout,
  type IdleRoleKey,
} from './mysteryIngameLayout';

interface MysteryIngameLayoutModalProps {
  open: boolean;
  onClose: () => void;
}

// Canonical authoring viewport — positions are stored as % of this.
const CANON_W = 1920;
const CANON_H = 1080;
const MIN_BOX = 4; // minimum box width/height in %

const DEFAULT_TEAM_SAMPLE = 'Les Aventuriers du Temps Perdu';

type EditorMode = 'ingame' | 'idle';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function MysteryIngameLayoutModal({ open, onClose }: MysteryIngameLayoutModalProps) {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as PreviewMysteryGameMeta;
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  const [mode, setMode] = useState<EditorMode>('ingame');

  // In-game layout state.
  const [layout, setLayout] = useState<Required<IngameLayout>>(() =>
    resolveIngameLayout(meta.ingame_layout),
  );
  const [selected, setSelected] = useState<IngameRoleKey>('enigma_name');
  const [teamSample, setTeamSample] = useState(DEFAULT_TEAM_SAMPLE);

  // Idle layout state.
  const [idleLayout, setIdleLayout] = useState<Required<IdleLayout>>(() =>
    resolveIdleLayout(meta.idle_layout),
  );
  const [selectedIdle, setSelectedIdle] = useState<IdleRoleKey>('title');
  const [subtitleSample, setSubtitleSample] = useState(IDLE_SUBTITLE_SAMPLE);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Re-seed from the scenario whenever the modal (re)opens, so external edits
  // to gameMeta are reflected.
  useEffect(() => {
    if (open) {
      setLayout(resolveIngameLayout(meta.ingame_layout));
      setIdleLayout(resolveIdleLayout(meta.idle_layout));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Push every in-game change into the editor's live gameMeta so it persists.
  useEffect(() => {
    if (!open) return;
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), ingame_layout: layout }) as typeof m,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, open]);

  // Push every idle change into the editor's live gameMeta so it persists.
  useEffect(() => {
    if (!open) return;
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), idle_layout: idleLayout }) as typeof m,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleLayout, open]);

  // Fit a CANON_W×CANON_H stage inside the canvas wrapper, centred — identical
  // math to MysteryPreviewRenderer so our draggable layer aligns with the board.
  useEffect(() => {
    if (!open) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const TARGET = CANON_W / CANON_H;
    function applyFit() {
      if (!wrapper) return;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w <= 0 || h <= 0) return;
      let sw: number, sh: number;
      if (w / h > TARGET) {
        sh = h;
        sw = h * TARGET;
      } else {
        sw = w;
        sh = w / TARGET;
      }
      setStage({ width: sw, height: sh });
    }
    applyFit();
    const ro = new ResizeObserver(applyFit);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const overlayFont = resolveFontFamily(meta.font) || 'Arial Black, Arial, sans-serif';
  const overlayColor = meta.font_color || '#ffffff';
  const scoreFullGame = meta.score_full_game ?? '100';
  const pointsUnits = meta.points_units ?? 'points';

  const firstEnigma = (meta.enigmas ?? [])[0];
  const enigmaSample = firstEnigma
    ? getLocalized(firstEnigma.text as never, lang, defaultLang) || `Enigma ${firstEnigma.number ?? 1}`
    : 'Enigma name';

  const scenarioTitle = getLocalized(meta.title as never, lang, defaultLang) || 'Scenario title';

  const textByRole: Record<IngameRoleKey, string> = useMemo(
    () => ({
      enigma_name: enigmaSample,
      timer: '88:88',
      score: pointsUnits === 'percentage' ? '100%' : `${scoreFullGame}/${scoreFullGame}`,
      team_name: teamSample || 'Team name',
    }),
    [enigmaSample, pointsUnits, scoreFullGame, teamSample],
  );

  const idleTextByRole: Record<IdleRoleKey, string> = useMemo(
    () => ({
      title: scenarioTitle,
      subtitle: subtitleSample || IDLE_SUBTITLE_SAMPLE,
    }),
    [scenarioTitle, subtitleSample],
  );

  // Scenario fonts available for the idle per-element font picker.
  const customFonts: CustomFont[] = Array.isArray(meta.custom_fonts)
    ? (meta.custom_fonts as CustomFont[])
    : [];
  const customFamilies = customFonts.map((f) => f.family).filter(Boolean) as string[];
  const standardFonts = FONT_CATALOG.filter((f) => f.group === 'standard');
  const themedFonts = FONT_CATALOG.filter((f) => f.group === 'themed');

  function updateBox(role: IngameRoleKey, patch: Partial<IngameBox>) {
    setLayout((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  function updateIdle(role: IdleRoleKey, patch: Partial<IdleElement>) {
    setIdleLayout((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  // Shared pointer drag (move) / resize (bottom-right handle): deltas px → %.
  function dragBox(
    e: React.PointerEvent,
    dragMode: 'move' | 'resize',
    start: { left: number; top: number; width: number; height: number },
    apply: (patch: { left?: number; top?: number; width?: number; height?: number }) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const sw = stage.width || 1;
    const sh = stage.height || 1;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / sw) * 100;
      const dyPct = ((ev.clientY - startY) / sh) * 100;
      if (dragMode === 'move') {
        apply({
          left: clamp(start.left + dxPct, 0, 100 - start.width),
          top: clamp(start.top + dyPct, 0, 100 - start.height),
        });
      } else {
        apply({
          width: clamp(start.width + dxPct, MIN_BOX, 100 - start.left),
          height: clamp(start.height + dyPct, MIN_BOX, 100 - start.top),
        });
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startDrag(e: React.PointerEvent, role: IngameRoleKey, dragMode: 'move' | 'resize') {
    setSelected(role);
    dragBox(e, dragMode, layout[role], (patch) => updateBox(role, patch));
  }

  function startIdleDrag(e: React.PointerEvent, role: IdleRoleKey, dragMode: 'move' | 'resize') {
    setSelectedIdle(role);
    dragBox(e, dragMode, idleLayout[role], (patch) => updateIdle(role, patch));
  }

  if (!open) return null;

  const sel = layout[selected];
  const selIdle = idleLayout[selectedIdle];

  // gameMeta for the backdrop: live meta + our in-progress layouts, with text
  // overlays suppressed (we draw our own draggable copies on top).
  const backdropMeta: PreviewMysteryGameMeta = {
    ...meta,
    ingame_layout: layout,
    idle_layout: idleLayout,
  };

  const modeBtn = (m: EditorMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`px-3 py-1 text-xs font-medium rounded ${
        mode === m ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-white shadow-2xl flex flex-col overflow-hidden w-screen h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-gray-900">
            {mode === 'idle' ? 'Idle screen layout' : 'In-game layout'}
          </h2>
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded border border-gray-200">
            {modeBtn('ingame', 'In-game')}
            {modeBtn('idle', 'Idle')}
          </div>
          <span className="text-xs text-gray-500">
            {mode === 'idle'
              ? 'Background-only screen shown between teams (when "reveal on Enter/click" is off). Add a title and/or subtitle.'
              : 'Drag to place the 4 text elements. The font auto-fits the box width — size each box to the maximum space its text should occupy.'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => editor.save()}
              disabled={editor.isSaving}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {editor.isSaving ? 'Saving…' : 'Save scenario'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <div className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3 space-y-4">
            {mode === 'ingame' ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Elements</p>
                  <div className="space-y-1">
                    {INGAME_ROLES.map((role) => (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => setSelected(role.key)}
                        className={`w-full text-left px-2.5 py-1.5 text-sm rounded border ${
                          selected === role.key
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected element controls */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">
                    {INGAME_ROLES.find((r) => r.key === selected)?.label} — alignment
                  </p>
                  <div className="flex items-center gap-1">
                    {([
                      ['left', AlignLeft],
                      ['center', AlignCenter],
                      ['right', AlignRight],
                    ] as Array<[IngameAlign, typeof AlignLeft]>).map(([a, Icon]) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => updateBox(selected, { align: a })}
                        className={`p-1.5 rounded border ${
                          (sel.align ?? 'center') === a
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        aria-label={a}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(['left', 'top', 'width', 'height'] as const).map((field) => (
                      <label key={field} className="text-xs text-gray-600">
                        <span className="capitalize">{field}</span>
                        <input
                          type="number"
                          value={Math.round(sel[field])}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isFinite(n)) return;
                            updateBox(selected, { [field]: clamp(n, 0, 100) } as Partial<IngameBox>);
                          }}
                          className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
                    The text size is set automatically to fill the box: it grows to
                    fill the <strong>width</strong> and shrinks if it would overflow.
                    Make the box as <strong>wide</strong> as the space you want the
                    text to occupy at most.
                  </p>
                </div>

                {/* Stress-test team name */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Preview team name</p>
                  <input
                    value={teamSample}
                    onChange={(e) => setTeamSample(e.target.value)}
                    placeholder="Type the longest expected name"
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Preview only — paste a long name to check the team-name box still reads.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLayout(resolveIngameLayout(undefined))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Elements</p>
                  <div className="space-y-1">
                    {IDLE_ROLES.map((role) => {
                      const el = idleLayout[role.key];
                      return (
                        <div
                          key={role.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 text-sm rounded border ${
                            selectedIdle === role.key
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={el.enabled}
                            onChange={(e) => updateIdle(role.key, { enabled: e.target.checked })}
                            className="w-4 h-4 accent-blue-600"
                            aria-label={`Show ${role.label}`}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedIdle(role.key)}
                            className={`flex-1 text-left ${
                              selectedIdle === role.key ? 'text-blue-700' : 'text-gray-700'
                            } ${el.enabled ? '' : 'opacity-50'}`}
                          >
                            {role.label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Tick to show an element on the idle screen, then drag it on the background.
                  </p>
                </div>

                {/* Selected idle element controls */}
                {selIdle.enabled ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">
                      {IDLE_ROLES.find((r) => r.key === selectedIdle)?.label} — alignment
                    </p>
                    <div className="flex items-center gap-1">
                      {([
                        ['left', AlignLeft],
                        ['center', AlignCenter],
                        ['right', AlignRight],
                      ] as Array<[IngameAlign, typeof AlignLeft]>).map(([a, Icon]) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => updateIdle(selectedIdle, { align: a })}
                          className={`p-1.5 rounded border ${
                            (selIdle.align ?? 'center') === a
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                          aria-label={a}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {(['left', 'top', 'width', 'height'] as const).map((field) => (
                        <label key={field} className="text-xs text-gray-600">
                          <span className="capitalize">{field}</span>
                          <input
                            type="number"
                            value={Math.round(selIdle[field])}
                            onChange={(e) => {
                              const n = parseFloat(e.target.value);
                              if (!isFinite(n)) return;
                              updateIdle(selectedIdle, { [field]: clamp(n, 0, 100) } as Partial<IdleElement>);
                            }}
                            className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </label>
                      ))}
                    </div>

                    {/* Typography: font / size / color */}
                    <label className="block text-xs text-gray-600">
                      <span>Font</span>
                      <select
                        value={selIdle.font ?? ''}
                        onChange={(e) => updateIdle(selectedIdle, { font: e.target.value })}
                        className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                      >
                        <option value="">Scenario default</option>
                        <optgroup label="Standard">
                          {standardFonts.map((f) => (
                            <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Themed">
                          {themedFonts.map((f) => (
                            <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                        {customFamilies.length > 0 && (
                          <optgroup label="Custom">
                            {customFamilies.map((c) => (
                              <option key={c} value={c} style={{ fontFamily: `"${c}", sans-serif` }}>
                                {c}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        <span>Font size (%)</span>
                        <input
                          type="number"
                          min={1}
                          max={40}
                          step={0.5}
                          value={selIdle.fontSizePct ?? 5}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isFinite(n)) return;
                            updateIdle(selectedIdle, { fontSizePct: clamp(n, 1, 40) });
                          }}
                          className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        <span>Color</span>
                        <input
                          type="color"
                          value={selIdle.color || overlayColor}
                          onChange={(e) => updateIdle(selectedIdle, { color: e.target.value })}
                          className="mt-0.5 w-full h-[34px] border border-gray-300 rounded"
                        />
                      </label>
                    </div>
                    {selIdle.color ? (
                      <button
                        type="button"
                        onClick={() => updateIdle(selectedIdle, { color: '' })}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        Use scenario color
                      </button>
                    ) : (
                      <p className="text-[11px] text-gray-400">Inheriting the scenario font color.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    {IDLE_ROLES.find((r) => r.key === selectedIdle)?.label} is hidden. Tick it above to
                    place and style it.
                  </p>
                )}

                {/* Preview subtitle text (the real text is set per-launch). */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Preview subtitle</p>
                  <input
                    value={subtitleSample}
                    onChange={(e) => setSubtitleSample(e.target.value)}
                    placeholder={IDLE_SUBTITLE_SAMPLE}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Preview only — the real subtitle is typed in the Launch Game window. The title
                    shows the scenario name.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIdleLayout(resolveIdleLayout(undefined))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </button>
              </>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 min-w-0 bg-slate-900 relative" ref={wrapperRef}>
            {/* Real board/background backdrop (text overlays hidden) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <MysteryPreviewRenderer
                gameMeta={backdropMeta}
                resolveMediaUrl={editor.getMediaUrl}
                readLocalized={(value) => getLocalized(value as never, lang, defaultLang)}
                enigmaView="revealed"
                gaugePercent={60}
                overscoreStage={0}
                selectedEnigmaIndex={0}
                screen={mode === 'idle' ? 'idle' : 'ingame'}
                canonicalWidth={CANON_W}
                canonicalHeight={CANON_H}
                lang={lang}
                defaultLang={defaultLang}
                hideIngameTextOverlays
              />
            </div>

            {/* Draggable boxes — centred stage matching the preview's. */}
            {stage.width > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: `${stage.width}px`,
                  height: `${stage.height}px`,
                }}
              >
                {mode === 'ingame'
                  ? INGAME_ROLES.map((role) => {
                      const box = layout[role.key];
                      const isSel = selected === role.key;
                      return (
                        <div
                          key={role.key}
                          onPointerDown={(e) => startDrag(e, role.key, 'move')}
                          style={{
                            position: 'absolute',
                            left: `${box.left}%`,
                            top: `${box.top}%`,
                            width: `${box.width}%`,
                            height: `${box.height}%`,
                            cursor: 'move',
                            outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.55)',
                            outlineOffset: '0px',
                            background: isSel ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)',
                            boxSizing: 'border-box',
                          }}
                        >
                          <MysteryLayoutBox
                            box={{ ...box, left: 0, top: 0, width: 100, height: 100 }}
                            stageWidth={(box.width / 100) * stage.width}
                            stageHeight={(box.height / 100) * stage.height}
                            text={textByRole[role.key]}
                            fontFamily={overlayFont}
                            color={overlayColor}
                          />
                          {/* Resize handle (bottom-right) */}
                          <div
                            onPointerDown={(e) => startDrag(e, role.key, 'resize')}
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              cursor: 'nwse-resize',
                            }}
                          />
                          {/* Role label */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 'calc(100% + 2px)',
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: isSel ? '#3b82f6' : 'rgba(0,0,0,0.55)',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {role.label}
                          </div>
                        </div>
                      );
                    })
                  : IDLE_ROLES.map((role) => {
                      const el = idleLayout[role.key];
                      if (!el.enabled) return null;
                      const isSel = selectedIdle === role.key;
                      return (
                        <div
                          key={role.key}
                          onPointerDown={(e) => startIdleDrag(e, role.key, 'move')}
                          style={{
                            position: 'absolute',
                            left: `${el.left}%`,
                            top: `${el.top}%`,
                            width: `${el.width}%`,
                            height: `${el.height}%`,
                            cursor: 'move',
                            outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.55)',
                            outlineOffset: '0px',
                            background: isSel ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)',
                            boxSizing: 'border-box',
                          }}
                        >
                          <MysteryIdleBox
                            element={{ ...el, left: 0, top: 0, width: 100, height: 100 }}
                            stageHeight={stage.height}
                            text={idleTextByRole[role.key]}
                            fallbackFontFamily={overlayFont}
                            fallbackColor={overlayColor}
                            resolveFont={resolveFontFamily}
                          />
                          {/* Resize handle (bottom-right) */}
                          <div
                            onPointerDown={(e) => startIdleDrag(e, role.key, 'resize')}
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              cursor: 'nwse-resize',
                            }}
                          />
                          {/* Role label */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 'calc(100% + 2px)',
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: isSel ? '#3b82f6' : 'rgba(0,0,0,0.55)',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {role.label}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
