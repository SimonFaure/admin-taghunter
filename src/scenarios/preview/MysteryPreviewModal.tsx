/**
 * Mystery preview modal — chrome around `<MysteryPreviewRenderer>`.
 *
 * Reads live in-memory `gameMeta` from the scenario editor (no save required).
 * Header controls: Locked/Revealed toggle, gauge fill %, overscore stage,
 * viewport, close. Pattern mirrors `TagquestPreviewModal`.
 */

import { useEffect, useState } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { getLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import {
  MysteryPreviewRenderer,
  type EnigmaView,
  type MysteryScreen,
  type PreviewMysteryGameMeta,
} from './MysteryPreviewRenderer';
import { ViewportSelect } from './ViewportSelect';
import { DEFAULT_VIEWPORT, type ViewportSize } from './viewportTypes';
import './mystery-preview.css';

interface MysteryPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export function MysteryPreviewModal({ open, onClose }: MysteryPreviewModalProps) {
  const editor = useScenarioEditor();
  const [enigmaView, setEnigmaView] = useState<EnigmaView>('locked');
  const [gaugePercent, setGaugePercent] = useState(60);
  const [overscoreStage, setOverscoreStage] = useState(0);
  const [selectedEnigmaIndex, setSelectedEnigmaIndex] = useState(0);
  const [viewport, setViewport] = useState<ViewportSize>(DEFAULT_VIEWPORT);
  const [fullscreen, setFullscreen] = useState(false);
  const [screen, setScreen] = useState<MysteryScreen>('ingame');

  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const meta = editor.gameMeta as PreviewMysteryGameMeta;
  const overscoreCount = (meta.overscores ?? []).length;
  const enigmaCount = (meta.enigmas ?? []).length;

  useEffect(() => {
    if (open) {
      setEnigmaView('locked');
      setGaugePercent(60);
      setOverscoreStage(0);
      setSelectedEnigmaIndex(0);
      setFullscreen(false);
      setScreen('ingame');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${fullscreen ? 'p-0' : 'p-4'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative bg-white shadow-2xl flex flex-col overflow-hidden ${
          fullscreen ? 'w-screen h-screen rounded-none' : 'w-[90vw] h-[90vh] rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-slate-50 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900 mr-2">Preview</h2>

          {/* Screen selector */}
          <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
            {([
              ['instructions', 'Instructions'],
              ['ingame', 'In-game'],
              ['endgame', 'Endgame'],
            ] as Array<[MysteryScreen, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScreen(id)}
                className={`px-3 py-1 text-xs ${
                  screen === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Locked / Revealed toggle */}
          <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setEnigmaView('locked')}
              className={`px-3 py-1 text-xs ${
                enigmaView === 'locked' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Locked
            </button>
            <button
              type="button"
              onClick={() => setEnigmaView('revealed')}
              className={`px-3 py-1 text-xs ${
                enigmaView === 'revealed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Revealed
            </button>
          </div>

          {/* Gauge fill slider */}
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <span>Gauge</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={gaugePercent}
              onChange={(e) => setGaugePercent(parseInt(e.target.value, 10))}
              className="w-28"
            />
            <span className="w-9 text-right tabular-nums">{gaugePercent}%</span>
          </label>

          {/* Overscore stage */}
          <label className="flex items-center gap-1 text-xs text-gray-700">
            <span>Overscore</span>
            <select
              value={overscoreStage}
              onChange={(e) => setOverscoreStage(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
            >
              <option value={0}>None</option>
              {Array.from({ length: overscoreCount }, (_, i) => (
                <option key={i} value={i + 1}>
                  Step {i + 1}
                </option>
              ))}
            </select>
          </label>

          {/* Enigma selector */}
          <label className="flex items-center gap-1 text-xs text-gray-700">
            <span>Enigma</span>
            <select
              value={selectedEnigmaIndex}
              onChange={(e) => setSelectedEnigmaIndex(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
              disabled={enigmaCount === 0}
            >
              {enigmaCount === 0 && <option value={0}>—</option>}
              {Array.from({ length: enigmaCount }, (_, i) => (
                <option key={i} value={i}>
                  #{(meta.enigmas ?? [])[i]?.number || i + 1}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <ViewportSelect value={viewport} onChange={setViewport} />
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Renderer */}
        <div className="flex-1 flex min-h-0">
          <MysteryPreviewRenderer
            gameMeta={meta}
            resolveMediaUrl={editor.getMediaUrl}
            readLocalized={(value) => getLocalized(value as never, lang, defaultLang)}
            enigmaView={enigmaView}
            gaugePercent={gaugePercent}
            overscoreStage={overscoreStage}
            selectedEnigmaIndex={selectedEnigmaIndex}
            screen={screen}
            canonicalWidth={viewport.width}
            canonicalHeight={viewport.height}
            lang={lang}
            defaultLang={defaultLang}
          />
        </div>
      </div>
    </div>
  );
}
