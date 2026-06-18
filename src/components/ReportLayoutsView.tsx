// Admin "Report layouts" — the mission-report PDF editor. Designs the global
// per-game-type default layout (block stack) that syncs to every playground.
// Per-scenario overrides are edited in the scenario editor, not here.
//
// Storage: backend/api/report_layouts.php (global, admin-owned). The block
// schema mirrors the playground's services/reportLayout.ts.

import { useEffect, useState } from 'react';
import { RotateCcw, Save, Loader2, Printer } from 'lucide-react';
import { reportLayoutsApi, type ReportLayout } from '../lib/api';
import { ReportLayoutEditor } from './ReportLayoutEditor';

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
      setLoading(false);
    })();
  }, []);

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
