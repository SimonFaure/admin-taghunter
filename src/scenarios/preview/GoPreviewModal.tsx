/**
 * Tag Hunter GO preview - shows each enigma with its printed GO short code and,
 * using the scenario's default GO pattern, which answer image sits behind each
 * letter (A/B or A/B/C/D) and which letter is the correct one. This is the
 * "correspondance images ↔ réponse" the operator uses to lay out the plaques.
 *
 * Read-only; reads gameMeta (enigmas + codes) + the default GO pattern's
 * pattern_data (letter→slot). Design: plans/tag-hunter-go.md.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { db } from '../../creator-ported/lib/db';
import type { Enigma } from '../../types/scenario-data';
import { GoPreviewContent, type GoPreviewEnigma } from './GoPreviewContent';

const SLOT_BY_KEY: Record<string, keyof Enigma> = {
  good: 'good_answer_image',
  wrong: 'wrong_answer_image',
  wrong2: 'wrong_answer_image_2',
  wrong3: 'wrong_answer_image_3',
};

interface PatternRow {
  index: number;
  assignments: Record<string, string>; // letter -> slot
}

export function GoPreviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const enigmas = (meta.enigmas as Enigma[] | undefined) ?? [];
  const answerCount = meta.go_answer_count === 4 ? 4 : 2;
  const letters = answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
  const goPatternUniqid = (meta.scenario_default_go_pattern as string | null | undefined) ?? '';

  const [rows, setRows] = useState<PatternRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !goPatternUniqid) {
      setRows(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('patterns')
          .select('pattern_data')
          .eq('pattern_uniqid', goPatternUniqid)
          .maybeSingle();
        const raw = (data as { pattern_data?: unknown } | null)?.pattern_data;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!cancelled) setRows(Array.isArray(parsed) ? (parsed as PatternRow[]) : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, goPatternUniqid]);

  if (!open) return null;

  const rawTitle = meta.title;
  const title =
    (typeof rawTitle === 'string'
      ? rawTitle
      : rawTitle && typeof rawTitle === 'object'
        ? (Object.values(rawTitle as Record<string, string>)[0] as string)
        : '') || 'GO preview';

  // Normalize the editor's local data (enigmas + the loaded pattern rows) into
  // the shared preview shape, resolving each answer image via the editor.
  const previewEnigmas: GoPreviewEnigma[] = enigmas.map((e, idx) => {
    const n = Number(e.number) || idx + 1;
    const row = rows?.find((r) => Number(r.index) === n);
    const answers = letters.map((l) => {
      const slot = row?.assignments?.[l] ?? (l === 'A' ? 'good' : 'wrong');
      const field = SLOT_BY_KEY[slot];
      const filename = field ? (e[field] as string | undefined) : undefined;
      return {
        letter: l,
        correct: slot === 'good',
        imageUrl: filename ? editor.getMediaUrl(filename) : null,
      };
    });
    return { number: String(e.number || idx + 1), short_code: e.short_code || '', answers };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">GO preview - codes & answers</h2>
            <p className="text-sm text-gray-500">uses the scenario's default GO pattern</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          {!goPatternUniqid ? (
            <p className="text-amber-600 text-sm">
              No default GO pattern selected. Set one in the “Default pattern” section (or use “Create
              random”) to preview the answers.
            </p>
          ) : loading ? (
            <p className="text-gray-500 text-sm">Loading pattern…</p>
          ) : (
            <GoPreviewContent
              title={title}
              answerCount={answerCount}
              enigmas={previewEnigmas}
              warning={rows && rows.length === 0 ? 'no_pattern_bound' : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
