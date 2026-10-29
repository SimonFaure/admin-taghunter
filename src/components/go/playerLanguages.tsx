import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { isLang, LANGUAGES } from '../../i18n/languages';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// GO / Spot player language policy (project_go_spot_player_languages), PER
// (scenario, app) on the grant row like the challenge list: whether the player
// app's setup screen offers a language picker, and which of the scenario's
// languages it lists. `clientId` is only passed by the admin page; a client acts
// on itself. go.php `load` applies it.

export interface PlayerLanguages {
  enabled: boolean;
  /** Allowed codes; empty = every language the scenario has. */
  languages: string[];
}

/** No saved policy = off: no picker until the operator turns it on. */
export const DEFAULT_PLAYER_LANGUAGES: PlayerLanguages = { enabled: false, languages: [] };

const langName = (code: string) => (isLang(code) ? LANGUAGES[code].nativeName : code.toUpperCase());

export function ScenarioLanguagePicker({
  clientId,
  scenarioId,
  app,
  scenarioLanguages,
  initial,
}: {
  clientId?: string | number | null;
  scenarioId: string | number;
  app: 'go' | 'spot';
  /** The languages this client may be served the scenario in. */
  scenarioLanguages: string[];
  initial?: PlayerLanguages | null;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PlayerLanguages>(initial ?? DEFAULT_PLAYER_LANGUAGES);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // A ticked language the scenario has since lost stays visible so it can be
  // un-ticked (same rule as the duration picker).
  const options = Array.from(new Set([...scenarioLanguages, ...settings.languages]));

  const commit = async (next: PlayerLanguages) => {
    setSettings(next);
    setSaving(true);
    try {
      await authFetch(`${API_BASE_URL}/go.php?action=player_languages_scenario_save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          app,
          ...next,
          ...(clientId ? { client_id: clientId } : {}),
        }),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const toggleLang = (code: string) => {
    const languages = settings.languages.includes(code)
      ? settings.languages.filter((c) => c !== code)
      : [...settings.languages, code];
    void commit({ ...settings, languages });
  };

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {t('goViews:playerLanguages.title')}
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {saved && !saving && <Check className="h-3 w-3 text-emerald-500" />}
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void commit({ ...settings, enabled: e.target.checked })}
          className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-xs text-slate-700">{t('goViews:playerLanguages.enable')}</span>
      </label>

      {settings.enabled ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((code) => {
              const on = settings.languages.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLang(code)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {langName(code)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {settings.languages.length
              ? t('goViews:playerLanguages.someHint')
              : t('goViews:playerLanguages.allHint')}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">{t('goViews:playerLanguages.disabledHint')}</p>
      )}
    </div>
  );
}
