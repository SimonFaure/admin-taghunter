import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  DEFAULT_PREVIEW_LABELS,
  type AdminLabelKey,
  type PreviewLabelsMap,
} from '../../scenarios/preview/previewLabels';
import { SUPPORTED_LANGS, type Lang } from '../../scenarios/i18n/types';
import { invalidateAdminTranslations } from '../../scenarios/preview/useAdminTranslations';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const META_KEY = 'tagquest_translations';

const LABEL_KEYS: readonly AdminLabelKey[] = ['score', 'malus', 'late_malus', 'combo_points', 'next_malus'];

const KEY_LABEL_TEXT: Record<AdminLabelKey, string> = {
  score: 'Score',
  malus: 'Malus',
  late_malus: 'Late Malus',
  combo_points: 'Combo Points',
  next_malus: 'Next Malus  ({s} = seconds)',
};

const DEFAULT_KEY_PROP: Record<AdminLabelKey, 'score' | 'malus' | 'lateMalus' | 'comboPoints' | 'nextMalus'> = {
  score: 'score',
  malus: 'malus',
  late_malus: 'lateMalus',
  combo_points: 'comboPoints',
  next_malus: 'nextMalus',
};

function seedFromDefaults(): PreviewLabelsMap {
  const map = {} as PreviewLabelsMap;
  for (const key of LABEL_KEYS) {
    map[key] = {};
    for (const lang of SUPPORTED_LANGS) {
      const v = DEFAULT_PREVIEW_LABELS[lang]?.[DEFAULT_KEY_PROP[key]];
      if (v) map[key][lang] = v;
    }
  }
  return map;
}

export default function AdminTranslationsView() {
  const { user, token } = useAuth();
  const [values, setValues] = useState<PreviewLabelsMap>(() => seedFromDefaults());
  const [version, setVersion] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['X-Auth-Token'] = token;
        const res = await fetch(
          `${API_BASE_URL}/default_config.php?action=get&meta=${META_KEY}`,
          { headers }
        );
        if (!active) return;
        if (res.status === 404) {
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setMessage({ type: 'error', text: `Failed to load translations (${res.status}).` });
          setLoading(false);
          return;
        }
        const json = await res.json();
        const remoteValue = json?.config?.value;
        const remoteVersion = json?.config?.version;
        if (remoteValue && typeof remoteValue === 'object') {
          const merged = seedFromDefaults();
          for (const key of LABEL_KEYS) {
            const remoteEntry = remoteValue[key];
            if (remoteEntry && typeof remoteEntry === 'object') {
              merged[key] = { ...merged[key], ...remoteEntry };
            }
          }
          setValues(merged);
        }
        if (typeof remoteVersion === 'number' || typeof remoteVersion === 'string') {
          setVersion(Number(remoteVersion) || 1);
        }
      } catch (err) {
        if (active) setMessage({ type: 'error', text: 'Network error while loading translations.' });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const setCell = (key: AdminLabelKey, lang: Lang, text: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: { ...prev[key], [lang]: text },
    }));
  };

  const handleSave = async () => {
    if (!user?.email) {
      setMessage({ type: 'error', text: 'You must be logged in as an admin to save.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['X-Auth-Token'] = token;
      const res = await fetch(`${API_BASE_URL}/default_config.php?action=create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_email: user.email,
          meta: META_KEY,
          version,
          value: values,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error || `Save failed (${res.status}).`;
        setMessage({ type: 'error', text: errMsg });
        return;
      }
      setVersion(Number(json.version) || version + 1);
      invalidateAdminTranslations();
      setMessage({ type: 'success', text: `Saved (v${json.version}).` });
    } catch {
      setMessage({ type: 'error', text: 'Network error while saving.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Loading translations…</div>;
  }

  return (
    <div className="p-6 max-w-full overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Translations</h1>
          <p className="text-sm text-slate-600 mt-1">
            Global tagquest HUD labels. Missing cells fall back to built-in defaults per
            language, then to French.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">v{version}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <table className="min-w-full border border-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-slate-50">
              Label
            </th>
            {SUPPORTED_LANGS.map((lang) => (
              <th key={lang} className="px-3 py-2 text-left font-medium text-slate-700 uppercase">
                {lang}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LABEL_KEYS.map((key) => (
            <tr key={key} className="border-t border-slate-200">
              <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">
                {KEY_LABEL_TEXT[key]}
              </td>
              {SUPPORTED_LANGS.map((lang) => (
                <td key={lang} className="px-1 py-1">
                  <input
                    type="text"
                    value={values[key]?.[lang] ?? ''}
                    onChange={(e) => setCell(key, lang, e.target.value)}
                    className="w-32 px-2 py-1 border border-slate-300 rounded text-sm"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
