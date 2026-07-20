/**
 * Pattern section - picks the default patterns this Mystery scenario uses:
 *  - the RFID/Playground pattern (each enigma's good/wrong answer images →
 *    station/balise), stored as `scenario_default_pattern` (pattern uniqid);
 *  - when the scenario is GO-capable, the default GO pattern (the letter→answer
 *    answer key), stored as `scenario_default_go_pattern`. One per scenario -
 *    go.php resolves the enigma correct letters from it. A "Create random"
 *    button auto-generates a GO pattern with N enigmas (randomised correct
 *    letters) and selects it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { useGoEditor } from '../../../shell/components/GoEditorContext';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { db } from '../../../../creator-ported/lib/db';

interface PatternOption {
  pattern_uniqid: string;
  name: string;
  status?: string | null;
  mode?: string | null;
  answer_count?: number | null;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// N enigma rows, each a random permutation of the answer slots so the correct
// letter varies per enigma. Slot mapped to 'good' is the correct answer.
function randomGoRows(n: number, answerCount: 2 | 4) {
  const slots = answerCount === 4 ? ['good', 'wrong', 'wrong2', 'wrong3'] : ['good', 'wrong'];
  const letters = answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const s = shuffle([...slots]);
    const assignments: Record<string, string> = {};
    letters.forEach((l, idx) => (assignments[l] = s[idx]));
    rows.push({ index: i, assignments });
  }
  return rows;
}

export function PatternSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const { adaptableGo, answerCount } = useGoEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const rfidValue = (meta.scenario_default_pattern as string | null | undefined) ?? '';
  const goValue = (meta.scenario_default_go_pattern as string | null | undefined) ?? '';
  const [patterns, setPatterns] = useState<PatternOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [enigmaCount, setEnigmaCount] = useState(12);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await db
      .from('patterns')
      .select('pattern_uniqid, name, status, mode, answer_count')
      .eq('game_type', 'mystery');
    if (Array.isArray(data)) {
      setPatterns((data as PatternOption[]).filter((p) => !!p.pattern_uniqid));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: string, v: string) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: v === '' ? null : v }) as typeof m);

  const rfidPatterns = patterns.filter((p) => p.mode !== 'go');
  const goPatterns = patterns.filter((p) => p.mode === 'go');
  const rfidKnown = rfidPatterns.some((p) => p.pattern_uniqid === rfidValue);
  const goKnown = goPatterns.some((p) => p.pattern_uniqid === goValue);

  const openCreate = () => {
    const n = Number(meta.number_of_enigmas) || (Array.isArray(meta.enigmas) ? (meta.enigmas as unknown[]).length : 0) || 12;
    setEnigmaCount(n);
    setError(null);
    setShowCreate(true);
  };

  const createRandom = async () => {
    setCreating(true);
    setError(null);
    try {
      const uniq = Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      const rows = randomGoRows(Math.max(1, enigmaCount), answerCount);
      const name = `GO auto · ${enigmaCount}×${answerCount === 4 ? 'ABCD' : 'AB'}`;
      const { error: insErr } = await db.from('patterns').insert({
        name,
        game_type: 'mystery',
        mode: 'go',
        answer_count: answerCount,
        pattern_data: JSON.stringify(rows),
        is_default: false,
        status: 'published',
        version: '1.0',
        pattern_uniqid: uniq,
        pattern_slug: uniq,
      });
      if (insErr) throw new Error(insErr.message || t('editorMystery:pattern.insertFailed'));
      await load();
      setField('scenario_default_go_pattern', uniq);
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('editorMystery:pattern.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <CollapsibleSection title={t('editorMystery:pattern.title')}>
      {/* RFID / Playground default pattern */}
      <label className="block">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorMystery:pattern.defaultMysteryPattern')}
        </span>
        <select
          value={rfidValue}
          onChange={(ev) => setField('scenario_default_pattern', ev.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">{t('editorMystery:pattern.none')}</option>
          {rfidPatterns.map((p) => (
            <option key={p.pattern_uniqid} value={p.pattern_uniqid}>
              {p.name}
              {p.status && p.status !== 'published' ? ` (${p.status})` : ''}
            </option>
          ))}
          {rfidValue && !rfidKnown && (
            <option value={rfidValue}>{t('editorMystery:pattern.notFound', { value: rfidValue })}</option>
          )}
        </select>
        <span className="text-xs text-gray-500 block mt-1">
          {t('editorMystery:pattern.rfidHint')}
        </span>
      </label>

      {/* GO default pattern (the answer key) */}
      {adaptableGo && (
        <div className="mt-5 border-t border-emerald-200 pt-4">
          <span className="text-xs font-medium text-emerald-800 mb-1 block">
            {t('editorMystery:pattern.defaultGoPattern')}
          </span>
          <div className="flex gap-2">
            <select
              value={goValue}
              onChange={(ev) => setField('scenario_default_go_pattern', ev.target.value)}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="">{t('editorMystery:pattern.none')}</option>
              {goPatterns.map((p) => (
                <option key={p.pattern_uniqid} value={p.pattern_uniqid}>
                  {p.name}
                  {p.answer_count ? ` · ${p.answer_count === 4 ? 'A/B/C/D' : 'A/B'}` : ''}
                  {p.status && p.status !== 'published' ? ` (${p.status})` : ''}
                </option>
              ))}
              {goValue && !goKnown && (
                <option value={goValue}>{t('editorMystery:pattern.notFound', { value: goValue })}</option>
              )}
            </select>
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 whitespace-nowrap"
            >
              {t('editorMystery:pattern.createRandom')}
            </button>
          </div>
          <span className="text-xs text-gray-500 block mt-1">
            {t('editorMystery:pattern.goHint')}
          </span>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">{t('editorMystery:pattern.createModalTitle')}</h3>
            <label className="mt-4 block">
              <span className="text-sm text-gray-700">{t('editorMystery:pattern.numberOfEnigmas')}</span>
              <input
                type="number"
                min={1}
                value={enigmaCount}
                onChange={(e) => setEnigmaCount(parseInt(e.target.value) || 1)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </label>
            <p className="mt-2 text-xs text-gray-500">
              {t('editorMystery:pattern.generateHint', {
                answers: answerCount === 4 ? 'A/B/C/D' : 'A/B',
              })}
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('editorMystery:pattern.cancel')}
              </button>
              <button
                type="button"
                onClick={createRandom}
                disabled={creating}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {creating ? t('editorMystery:pattern.creating') : t('editorMystery:pattern.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
