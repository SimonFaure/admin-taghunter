import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Upload, Download, FileSpreadsheet, Loader2, X, AlertCircle } from 'lucide-react';
import {
  PATTERN_GAME_TYPES,
  getShape,
  columnLabel,
  emptyRow,
  rowsFromMatrix,
  templateHeaders,
  parsePatternData,
  type PatternRow,
} from './patternShapes';
import { StationSelect, type Station } from './StationSelect';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface EditablePattern {
  id: number;
  name: string;
  description?: string;
  game_type: string;
  pattern_data: string;
}

interface PatternBuilderModalProps {
  token: string;
  pattern?: EditablePattern | null;
  onClose: () => void;
  onCreated: () => void;
}

// Normalise loaded rows so every row has all columns for the game type.
function rowsForGameType(parsed: PatternRow[], gameType: string): PatternRow[] {
  if (parsed.length === 0) return [1, 2, 3, 4].map((i) => emptyRow(gameType, i));
  const types = getShape(gameType).types;
  return parsed.map((r, i) => {
    const assignments: Record<string, number | null> = {};
    for (const t of types) assignments[t] = r.assignments?.[t] ?? null;
    return { index: i + 1, assignments };
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PatternBuilderModal({ token, pattern, onClose, onCreated }: PatternBuilderModalProps) {
  const { t } = useTranslation('patternBuilder');
  const editing = !!pattern;
  const [gameType, setGameType] = useState(pattern?.game_type ?? 'mystery');
  const [name, setName] = useState(pattern?.name ?? '');
  const [description, setDescription] = useState(pattern?.description ?? '');
  const [rows, setRows] = useState<PatternRow[]>(() =>
    pattern
      ? rowsForGameType(parsePatternData(pattern.pattern_data), pattern.game_type)
      : [1, 2, 3, 4].map((i) => emptyRow('mystery', i))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shape = getShape(gameType);
  const stationIds = new Set(stations.map((s) => s.id));

  // Load the SI balises (stations) so rows pick from the real station list,
  // mirroring the admin pattern editor.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/patterns.php?action=stations`, {
          headers: { 'X-Auth-Token': token },
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(body?.data)) setStations(body.data);
      } catch {
        /* non-fatal: the grid still works, just without the station list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const changeGameType = (gt: string) => {
    setGameType(gt);
    setRows([1, 2, 3, 4].map((i) => emptyRow(gt, i)));
    setInfo(null);
    setError(null);
  };

  const setCellValue = (rowIdx: number, typeKey: string, value: number | null) => {
    setRows((prev) =>
      prev.map((r, i) => (i !== rowIdx ? r : { ...r, assignments: { ...r.assignments, [typeKey]: value } }))
    );
  };

  // Station ids already assigned anywhere in this pattern — used to stop a
  // station being picked twice (each disabled in the other cells' dropdowns).
  const usedStationKeys = useMemo(() => {
    const used = new Set<number>();
    rows.forEach((r) => Object.values(r.assignments).forEach((v) => {
      if (v != null) used.add(v);
    }));
    return used;
  }, [rows]);

  const addRow = () => setRows((prev) => [...prev, emptyRow(gameType, prev.length + 1)]);
  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, index: i + 1 })));

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setError(null);
    setInfo(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // A downloaded pattern carries a "meta" sheet + a "pattern" grid sheet —
      // prefer the grid; otherwise fall back to the first sheet.
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'pattern') ?? wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as Array<Array<string | number>>;
      const parsed = rowsFromMatrix(matrix, gameType);
      if (parsed.length === 0) {
        setError(t('import.noRows'));
        return;
      }
      setRows(parsed);
      setInfo(t('import.imported', { count: parsed.length, file: file.name }));
    } catch (err) {
      setError(err instanceof Error ? t('import.readError', { message: err.message }) : t('import.readErrorGeneric'));
    }
  };

  const downloadCsvTemplate = () => {
    const headers = templateHeaders(gameType);
    const blank = Array.from({ length: 8 }, () => headers.map(() => '').join(','));
    const csv = [headers.join(','), ...blank].join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `pattern_template_${gameType}.csv`);
  };

  const downloadXlsxTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = templateHeaders(gameType);
    const aoa = [headers, ...Array.from({ length: 8 }, () => headers.map(() => ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'pattern');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    downloadBlob(
      new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `pattern_template_${gameType}.xlsx`
    );
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t('errors.nameRequired'));
      return;
    }
    // Keep only rows with at least one station filled in; reindex sequentially.
    const cleaned = rows
      .filter((r) => Object.values(r.assignments).some((v) => v != null))
      .map((r, i) => ({ index: i + 1, assignments: r.assignments }));
    if (cleaned.length === 0) {
      setError(t('errors.rowRequired'));
      return;
    }

    setSaving(true);
    try {
      const action = editing ? 'update' : 'create';
      const res = await fetch(`${API_BASE_URL}/patterns.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({
          ...(editing ? { id: pattern!.id } : {}),
          name: name.trim(),
          description: description.trim() || null,
          game_type: gameType,
          pattern_data: cleaned,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) {
        throw new Error(body?.error || (editing ? t('errors.updateFailed') : t('errors.createFailed')));
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-900">{editing ? t('title.edit') : t('title.new')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title={t('close')}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('gameType')}</label>
              <select
                value={gameType}
                onChange={(e) => changeGameType(e.target.value)}
                disabled={editing}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
              >
                {PATTERN_GAME_TYPES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('description')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Import + templates */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800"
            >
              <Upload className="w-4 h-4" />
              {t('importExcel')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={handleImport}
            />
            <span className="text-xs text-slate-400">{t('orDownloadTemplate')}</span>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm hover:border-slate-300"
            >
              <Download className="w-4 h-4" />
              {t('csv')}
            </button>
            <button
              type="button"
              onClick={downloadXlsxTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm hover:border-slate-300"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('excel')}
            </button>
          </div>

          {info && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {info}
            </div>
          )}

          {/* Assignment grid */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-12">{t('table.number')}</th>
                  {shape.types.map((typeKey) => (
                    <th key={typeKey} className="px-3 py-2">
                      {columnLabel(typeKey, t)}
                    </th>
                  ))}
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{rIdx + 1}</td>
                    {shape.types.map((typeKey) => {
                      const val = row.assignments[typeKey] ?? null;
                      // Include any imported-but-unknown station id so it isn't lost.
                      const stationOptions: Station[] =
                        val != null && !stationIds.has(val)
                          ? [...stations, { id: val, station_name: t('stationUnknown', { id: val }) }]
                          : stations;
                      return (
                        <td key={typeKey} className="px-3 py-2">
                          <StationSelect
                            stations={stationOptions}
                            value={val}
                            usedStationKeys={usedStationKeys}
                            onChange={(id) => setCellValue(rIdx, typeKey, id)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(rIdx)}
                        title={t('table.removeRow')}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t border-slate-100">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                {t('table.addRow')}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? t('saving') : editing ? t('saveChanges') : t('createPattern')}
          </button>
        </div>
      </div>
    </div>
  );
}
