import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Settings, Gamepad2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { HelpButton } from '../../help';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface GameTypeLite {
  code: string;
  name: string;
  supports_tutorial_video: boolean;
  supports_intro_video: boolean;
}

interface GamePref {
  play_tutorial_default?: boolean;
  play_intro_default?: boolean;
}

interface PreferencesShape {
  game_prefs?: Record<string, GamePref>;
  [k: string]: unknown;
}

type TabKey = 'game-preferences';

export function MySettingsView() {
  const { t } = useTranslation('clientSettings');
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('game-preferences');
  const [gameTypes, setGameTypes] = useState<GameTypeLite[]>([]);
  const [prefs, setPrefs] = useState<PreferencesShape>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const headersJson = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gtRes, prefRes] = await Promise.all([
        fetch(`${API_BASE_URL}/game_types.php?action=list`, { headers: headersJson }),
        fetch(`${API_BASE_URL}/client_preferences.php`, { headers: headersJson }),
      ]);
      if (!gtRes.ok) throw new Error(t('errors.gameTypesLoadFailed', { status: gtRes.status }));
      if (!prefRes.ok) throw new Error(t('errors.preferencesLoadFailed', { status: prefRes.status }));
      const gtJson = await gtRes.json();
      const prefJson = await prefRes.json();
      setGameTypes((gtJson.game_types || []) as GameTypeLite[]);
      setPrefs((prefJson.preferences || {}) as PreferencesShape);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [headersJson, t]);

  useEffect(() => { load(); }, [load]);

  const updatePref = (code: string, field: 'play_tutorial_default' | 'play_intro_default', value: boolean) => {
    setPrefs((prev) => {
      const next: PreferencesShape = { ...prev, game_prefs: { ...(prev.game_prefs || {}) } };
      const existing = next.game_prefs![code] || {};
      next.game_prefs![code] = { ...existing, [field]: value };
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/client_preferences.php`, {
        method: 'PUT',
        headers: headersJson,
        body: JSON.stringify({ preferences: prefs }),
      });
      if (!res.ok) throw new Error(t('errors.saveFailedStatus', { status: res.status }));
      setSavedMessage(t('savedMessage'));
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const gameTypesWithVideos = gameTypes.filter(
    (gt) => gt.supports_tutorial_video || gt.supports_intro_video
  );

  if (loading) return <div className="p-8 text-slate-500">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-slate-700" />
        <h2 className="text-2xl font-bold text-slate-900">{t('title')}</h2>
        <HelpButton chapter="settings" className="text-slate-400 hover:text-slate-700 ml-1" />
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('game-preferences')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'game-preferences'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Gamepad2 className="w-4 h-4 inline mr-2" />
          {t('tabs.gamePreferences')}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">{t('dismiss')}</button>
        </div>
      )}

      {savedMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{savedMessage}</span>
        </div>
      )}

      {activeTab === 'game-preferences' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('gamePrefs.intro')}
          </p>

          {gameTypesWithVideos.length === 0 ? (
            <div className="text-slate-500 italic">{t('gamePrefs.noVideoSupport')}</div>
          ) : (
            <div className="space-y-4">
              {gameTypesWithVideos.map((gt) => {
                const pref = prefs.game_prefs?.[gt.code] || {};
                return (
                  <div key={gt.code} className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">{gt.name}</h3>
                    <div className="space-y-2">
                      {gt.supports_tutorial_video && (
                        <label className="flex items-center gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={!!pref.play_tutorial_default}
                            onChange={(e) => updatePref(gt.code, 'play_tutorial_default', e.target.checked)}
                          />
                          {t('gamePrefs.playTutorialDefault')}
                        </label>
                      )}
                      {gt.supports_intro_video && (
                        <label className="flex items-center gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={!!pref.play_intro_default}
                            onChange={(e) => updatePref(gt.code, 'play_intro_default', e.target.checked)}
                          />
                          {t('gamePrefs.playIntroDefault')}
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t('saving') : t('savePreferences')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
