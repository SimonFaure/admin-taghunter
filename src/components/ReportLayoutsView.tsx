// Admin "Report layouts" - the mission-report PDF editor. Designs the global
// per-game-type default layout (block stack) that syncs to every playground.
// Per-scenario overrides are edited in the scenario editor, not here.
//
// Storage: backend/api/report_layouts.php (global, admin-owned). The block
// schema mirrors the playground's services/reportLayout.ts.

import { useEffect, useState } from 'react';
import { RotateCcw, Save, Loader2, Printer } from 'lucide-react';
import { reportLayoutsApi, type ReportLayout, type ReportPrintFormat } from '../lib/api';
import { ReportLayoutEditor } from './ReportLayoutEditor';

// Playground print default when the admin never set one (legacy ticket size).
const FALLBACK_PRINT_FORMAT: ReportPrintFormat = {
  paper: 'ticket_100x150',
  customMm: { width: 100, height: 150 },
  orientation: 'portrait',
};

const PAPER_LABELS: Record<ReportPrintFormat['paper'], string> = {
  ticket_100x150: 'Ticket 100×150 mm',
  a4: 'A4 (210×297 mm)',
  a5: 'A5 (148×210 mm)',
  a6: 'A6 (105×148 mm)',
  custom: 'Custom…',
};

// Display labels for game-type codes (e.g. `tracks` → "Track"). Falls back to
// the raw code for unknown/legacy types.
const GAME_TYPE_LABELS: Record<string, string> = {
  mystery: 'Mystery',
  tagquest: 'Tagquest',
  tracks: 'Track',
  clash: 'Clash',
};

export function ReportLayoutsView() {
  const [layouts, setLayouts] = useState<Record<string, ReportLayout>>({});
  const [statFields, setStatFields] = useState<Record<string, string[]>>({});
  const [gameTypes, setGameTypes] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printFormat, setPrintFormat] = useState<ReportPrintFormat>(FALLBACK_PRINT_FORMAT);
  const [savingFormat, setSavingFormat] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await reportLayoutsApi.getAll();
      if (res.error || !res.data) { setError(res.error ?? 'Failed to load'); setLoading(false); return; }
      setLayouts(res.data.layouts);
      setStatFields(res.data.stat_fields);
      setGameTypes(res.data.game_types);
      setActive(res.data.game_types[0] ?? '');
      setVersion(res.data.version);
      if (res.data.print_format) setPrintFormat(res.data.print_format);
      setLoading(false);
    })();
  }, []);

  // Persist the default print format immediately (it's a preference, not a
  // design draft - no dirty/save cycle).
  const persistFormat = async (next: ReportPrintFormat) => {
    setPrintFormat(next);
    // Don't push a half-typed custom size; blur with valid numbers will save.
    if (next.paper === 'custom' && (next.customMm.width <= 0 || next.customMm.height <= 0)) return;
    setSavingFormat(true); setError(null);
    const res = await reportLayoutsApi.savePrintFormat(next);
    setSavingFormat(false);
    if (res.error || !res.data) { setError(res.error ?? 'Print format save failed'); return; }
    setVersion(res.data.version);
  };

  const layout = layouts[active];

  const handleSave = async () => {
    if (!layout) return;
    setSaving(true); setError(null);
    const res = await reportLayoutsApi.save(active, layout);
    setSaving(false);
    if (res.error || !res.data) { setError(res.error ?? 'Save failed'); return; }
    setVersion(res.data.version);
    setDirty(false);
  };

  const handleReset = async () => {
    if (!confirm(`Reset the ${active} report layout to the built-in default? This replaces the current design.`)) return;
    setSaving(true); setError(null);
    const res = await reportLayoutsApi.reset(active);
    setSaving(false);
    if (res.error || !res.data) { setError(res.error ?? 'Reset failed'); return; }
    setLayouts((prev) => ({ ...prev, [active]: res.data!.layout }));
    setVersion(res.data.version);
    setDirty(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh] text-slate-400"><Loader2 className="animate-spin mr-2" size={20} /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2"><Printer size={20} /> Report layouts</h2>
          <p className="text-sm text-slate-400">Design the default mission-report PDF for each game type. Synced to all playgrounds (v{version}).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50">
            <RotateCcw size={15} /> Reset to default
          </button>
          <button onClick={handleSave} disabled={saving || !dirty} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Save
          </button>
        </div>
      </div>

      {error && <div className="px-3 py-2 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{error}</div>}

      {/* Default physical output. Devices whose operator never touched
          Settings → Printing use this; a local choice always wins. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700">
        <span className="text-sm font-medium text-slate-200">Default print format</span>
        <select
          value={printFormat.paper}
          onChange={(e) => persistFormat({ ...printFormat, paper: e.target.value as ReportPrintFormat['paper'] })}
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200"
        >
          {(Object.keys(PAPER_LABELS) as Array<ReportPrintFormat['paper']>).map((p) => (
            <option key={p} value={p}>{PAPER_LABELS[p]}</option>
          ))}
        </select>
        {printFormat.paper === 'custom' && (
          <span className="flex items-center gap-1.5 text-sm text-slate-300">
            <input
              type="number" min={20} max={500}
              value={printFormat.customMm.width}
              onChange={(e) => setPrintFormat({ ...printFormat, customMm: { ...printFormat.customMm, width: Number(e.target.value) } })}
              onBlur={() => persistFormat(printFormat)}
              className="w-20 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200"
            />
            ×
            <input
              type="number" min={20} max={500}
              value={printFormat.customMm.height}
              onChange={(e) => setPrintFormat({ ...printFormat, customMm: { ...printFormat.customMm, height: Number(e.target.value) } })}
              onBlur={() => persistFormat(printFormat)}
              className="w-20 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200"
            />
            mm
          </span>
        )}
        <select
          value={printFormat.orientation}
          onChange={(e) => persistFormat({ ...printFormat, orientation: e.target.value as ReportPrintFormat['orientation'] })}
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200"
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        {savingFormat && <Loader2 className="animate-spin text-slate-400" size={15} />}
        <span className="text-xs text-slate-500">Proposed as the default in the print dialog on devices; a client's own format (client portal) wins over this.</span>
      </div>

      <div className="flex gap-2">
        {gameTypes.map((gt) => (
          <button key={gt} onClick={() => setActive(gt)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize border ${active === gt ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'}`}>
            {GAME_TYPE_LABELS[gt] || gt}
          </button>
        ))}
      </div>

      {layout && (
        <ReportLayoutEditor
          layout={layout}
          availableFields={statFields[active] ?? []}
          showTitleFields
          onChange={(next) => { setLayouts((prev) => ({ ...prev, [active]: next })); setDirty(true); }}
        />
      )}
    </div>
  );
}
