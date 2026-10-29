/**
 * "Available in" - the languages an admin-owned scenario is meant to exist in,
 * plus the "cover contains text" tick. Admin only; renders nothing for a
 * licensee's own scenario.
 *
 * The target languages cap validation: a language outside them can never be
 * released to licensees, and unticking a released one withdraws it (after a
 * confirmation). Ticking one releases nothing - it still has to be validated
 * in Admin > Translations. Both settings also drive the Scenario overview's
 * checklist.
 *
 * Saved IMMEDIATELY through their own endpoints, not by the scenario Save:
 * they live outside `scenarios.data`, so no playground re-downloads the
 * scenario because of them.
 */

import { useEffect, useState } from 'react';
import { CLIENT_LANGS, LANGUAGES, SUPPORTED_LANGS, type Lang } from '../../../i18n/languages';
import { authFetch } from '../../../lib/authFetch';
import { useScenarioEditor } from '../useScenarioEditor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface Meta {
  gated: boolean;
  default_language: string;
  target_languages: string[];
  validated_languages: string[];
  cover_has_text: boolean;
}

interface Props {
  /** Tells the shell which languages are still released (drives the draft badges). */
  onValidatedChange: (validated: string[]) => void;
}

export function ScenarioTargetLanguages({ onValidatedChange }: Props) {
  const editor = useScenarioEditor();
  const { uniqid, isAdmin } = editor;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isAdmin || !uniqid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/scenario_overview.php?action=meta&uniqid=${encodeURIComponent(uniqid)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setMeta(json);
      } catch {
        /* the control simply stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid, isAdmin]);

  if (!isAdmin || !meta || !meta.gated) return null;

  const post = async (endpoint: string, body: Record<string, unknown>) => {
    const res = await authFetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqid, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
    return json;
  };

  const own = meta.default_language;
  const targets = meta.target_languages;

  const toggleLang = async (lang: Lang) => {
    const removing = targets.includes(lang);
    if (removing && meta.validated_languages.includes(lang)) {
      const name = LANGUAGES[lang].englishName;
      const ok = window.confirm(
        `${name} is released to licensees. Removing it withdraws it: licensees lose ${name} on their next sync, and ${name}-language licensees lose this scenario from their catalogue.\n\nRemove ${name}?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = removing ? targets.filter((l) => l !== lang) : [...targets, lang];
      const json = await post('scenario_translations.php?action=set_target_languages', { langs: next });
      setMeta({ ...meta, target_languages: json.target_languages, validated_languages: json.validated_languages });
      onValidatedChange(json.validated_languages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCoverText = async (value: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const json = await post('scenario_overview.php?action=set_cover_has_text', { cover_has_text: value });
      setMeta({ ...meta, cover_has_text: json.cover_has_text === true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choices = showAll
    ? SUPPORTED_LANGS
    : SUPPORTED_LANGS.filter((l) => CLIENT_LANGS.includes(l) || targets.includes(l));
  const others = targets.filter((l) => l !== own);
  const ownName = LANGUAGES[own as Lang]?.englishName ?? own;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">Available in</span>
        {choices.map((lang) => {
          const isOwn = lang === own;
          const released = meta.validated_languages.includes(lang);
          return (
            <label
              key={lang}
              className={`inline-flex items-center gap-1.5 text-sm ${isOwn ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}
              title={
                isOwn
                  ? "The scenario's own language - always available"
                  : targets.includes(lang)
                    ? released
                      ? 'Target language, released to licensees'
                      : 'Target language, not released yet (validate it in Admin > Translations)'
                    : 'Not a target: can never be released to licensees'
              }
            >
              <input
                type="checkbox"
                checked={isOwn || targets.includes(lang)}
                disabled={isOwn || busy}
                onChange={() => void toggleLang(lang)}
              />
              {LANGUAGES[lang].englishName}
            </label>
          );
        })}
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-blue-600 hover:text-blue-700">
          {showAll ? 'Fewer languages' : 'More languages'}
        </button>
      </div>

      <p className="mt-1.5 text-xs text-gray-500">
        {others.length === 0
          ? `Available in ${ownName} only: licensees in another language never receive this scenario.`
          : `A target language reaches licensees once it is validated in Admin > Translations. Saved immediately.`}
      </p>

      <label
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer"
        title="When ticked, the Scenario overview expects a version of the cover for every target language"
      >
        <input
          type="checkbox"
          checked={meta.cover_has_text}
          disabled={busy}
          onChange={(e) => void toggleCoverText(e.target.checked)}
        />
        The game cover visual contains text (a version is needed per target language)
      </label>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
