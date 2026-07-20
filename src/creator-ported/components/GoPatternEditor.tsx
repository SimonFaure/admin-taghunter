// @ts-nocheck - sibling of PatternEditor (also @ts-nocheck); retype in Phase 5.
//
// Tag Hunter GO pattern editor. A GO pattern is the answer key + plaque layout
// for a GO-capable Mystery: rows = enigmas, columns = the on-screen letters
// (A/B for 2-answer, A/B/C/D for 4-answer). Each letter maps to one of the
// enigma's image slots; the letter mapped to the GOOD slot is the correct
// answer. The letters of a row are a permutation of the slots (each slot used
// once), which guarantees exactly one correct letter per enigma.
//
// Stored in patterns.pattern_data as [{index, assignments:{A:slot,B:slot,...}}]
// with patterns.mode='go' and patterns.answer_count = 2|4. Design: memory
// project_taghunter_go / plans/tag-hunter-go.md (Phase 1).

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Upload } from 'lucide-react';
import { db } from '../lib/db';
import { Alert } from './Alert';
import { authService } from '../services/authService';
import { generatePatternSlug } from '../utils/patterns';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

const SLOT_LABELS: Record<string, string> = {
  good: 'Good answer',
  wrong: 'Wrong 1',
  wrong2: 'Wrong 2',
  wrong3: 'Wrong 3',
};

interface GoPatternEditorProps {
  patternId: string;
  patternName: string;
  answerCount: 2 | 4;
  onBack: () => void;
}

type GoAssignments = Record<string, string>; // letter -> slot
interface GoRow {
  index: number;
  assignments: GoAssignments;
}

export function GoPatternEditor({ patternId, patternName, answerCount, onBack }: GoPatternEditorProps) {
  const letters = answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
  const slots = answerCount === 4 ? ['good', 'wrong', 'wrong2', 'wrong3'] : ['good', 'wrong'];

  const [name, setName] = useState(patternName);
  const [version, setVersion] = useState<number>(1.0);
  const [slug, setSlug] = useState('');
  const [rows, setRows] = useState<GoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // The identity mapping: A=good, B=wrong, C=wrong2, D=wrong3.
  const defaultAssignments = (): GoAssignments => {
    const a: GoAssignments = {};
    letters.forEach((l, i) => { a[l] = slots[i]; });
    return a;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('patterns')
          .select('pattern_data, version, pattern_slug, name')
          .eq('id', patternId)
          .single();
        if (data) {
          setVersion(data.version ?? 1.0);
          setSlug(data.pattern_slug || generatePatternSlug(data.name || patternName));
          const raw = data.pattern_data;
          const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
          const items = Array.isArray(parsed) ? parsed : null;
          if (items && items.length > 0 && items.every((it) => it && typeof it.index === 'number' && it.assignments)) {
            setRows(items.map((it) => ({ index: it.index, assignments: { ...it.assignments } })));
          } else {
            setRows([{ index: 1, assignments: defaultAssignments() }]);
          }
        } else {
          setRows([{ index: 1, assignments: defaultAssignments() }]);
        }
      } catch (e) {
        console.error('Error loading GO pattern:', e);
        setAlert({ type: 'error', message: 'Failed to load pattern.' });
        setRows([{ index: 1, assignments: defaultAssignments() }]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternId]);

  const safeParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  // Setting a letter to a slot keeps the row a permutation: whichever OTHER
  // letter currently holds the chosen slot swaps to the slot this letter gave up.
  const setCell = (rowIndex: number, letter: string, slot: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.index !== rowIndex) return row;
        const prevSlot = row.assignments[letter];
        const other = letters.find((l) => l !== letter && row.assignments[l] === slot);
        const next = { ...row.assignments, [letter]: slot };
        if (other) next[other] = prevSlot;
        return { ...row, assignments: next };
      }),
    );
  };

  const correctLetter = (a: GoAssignments) => letters.find((l) => a[l] === 'good') ?? '?';

  const addRow = () => {
    const maxIndex = rows.length > 0 ? Math.max(...rows.map((r) => r.index)) : 0;
    setRows((prev) => [...prev, { index: maxIndex + 1, assignments: defaultAssignments() }]);
  };

  const removeRow = (rowIndex: number) => {
    setRows((prev) => prev.filter((r) => r.index !== rowIndex));
  };

  const save = async (publish: boolean) => {
    const email = authService.getEmail();
    if (!email) {
      setAlert({ type: 'error', message: 'You must be logged in.' });
      return;
    }
    setSaving(true);
    try {
      const pattern_data = rows.map((r) => ({ index: r.index, assignments: r.assignments }));
      const nextVersion = publish
        ? Math.round((Number(version || 1.0) + 0.1) * 10) / 10
        : Number(version || 1.0);
      const body = {
        email,
        client_id: authService.getClientId(),
        name,
        game_type: 'mystery',
        mode: 'go',
        answer_count: answerCount,
        pattern_data,
        version: nextVersion,
        is_default: authService.isAdmin(),
        id: patternId,
        slug: slug || generatePatternSlug(name),
      };
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(authService.getAuthHeaders() as Record<string, string>),
      };
      const res = await fetch(`${API_BASE_URL}/patterns.php?action=upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed');
      setVersion(nextVersion);
      setAlert({ type: 'success', message: publish ? 'Pattern published.' : 'Pattern saved.' });
    } catch (e) {
      setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading pattern...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} /> Back
          </button>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xl font-bold bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-sm text-emerald-300 bg-emerald-900/40 border border-emerald-700 px-2 py-0.5 rounded">
              GO · {answerCount === 4 ? 'A/B/C/D' : 'A/B'}
            </span>
            <span className="text-sm text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">v{version}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <Upload size={16} /> Publish
          </button>
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-400">
        Each row is one enigma. Pick which answer each letter shows; the letter on the <span className="text-emerald-300">Good answer</span> is
        the correct one. The printed plaque arranges the enigma’s images in this letter order.
      </p>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase w-16">Enigma</th>
                {letters.map((l) => (
                  <th key={l} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                    Letter {l}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Correct</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row.index} className={`border-b border-slate-700/50 ${rowIdx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/60'}`}>
                  <td className="px-4 py-3 text-sm font-mono text-slate-300">{row.index}</td>
                  {letters.map((l) => (
                    <td key={l} className="px-4 py-3">
                      <select
                        value={row.assignments[l] ?? ''}
                        onChange={(e) => setCell(row.index, l, e.target.value)}
                        className={`px-2 py-1.5 rounded border bg-slate-700 text-sm text-slate-100 ${
                          row.assignments[l] === 'good' ? 'border-emerald-500' : 'border-slate-600'
                        }`}
                      >
                        {slots.map((s) => (
                          <option key={s} value={s}>{SLOT_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-sm font-bold text-emerald-300">{correctLetter(row.assignments)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeRow(row.index)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded"
                      title="Remove enigma"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="px-4 py-8 text-center text-slate-400 text-sm">No enigmas yet.</div>}
      </div>

      <div className="mt-4">
        <button
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg transition-colors text-sm text-slate-300"
        >
          <Plus size={16} /> Add enigma
        </button>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
    </div>
  );
}
