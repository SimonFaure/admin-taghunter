// @ts-nocheck - ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save } from 'lucide-react';
import { db } from '../lib/db';
import { authService } from '../services/authService';
import { authFetch } from '../../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ALL_GAME_TYPES = ['mystery', 'tagquest', 'tracks', 'clash'] as const;
const GAME_TYPE_LABELS: Record<string, string> = {
  mystery: 'Mystery',
  tagquest: 'Tagquest',
  tracks: 'Track',
  clash: 'Clash',
};

interface ScenarioCreatorProps {
  onBack: () => void;
  onSave: (scenarioId: string, gameType: string) => void;
  isAdmin: boolean;
}

export function ScenarioCreator({ onBack, onSave, isAdmin }: ScenarioCreatorProps) {
  const { t } = useTranslation('creatorComponents');
  const [title, setTitle] = useState('');
  const [gameType, setGameType] = useState<'mystery' | 'tagquest' | 'tracks' | 'clash'>('mystery');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [scenarioType, setScenarioType] = useState<'product' | 'custom'>('custom');
  const [saving, setSaving] = useState(false);

  // Admins may author any type (incl. globally-disabled ones, to prep content).
  // Clients only see types available to them - game_types.php?action=list already
  // returns the client's effective set (global ∩ per-client). See disable-game-types.md.
  const [availableTypes, setAvailableTypes] = useState<string[]>([...ALL_GAME_TYPES]);
  useEffect(() => {
    if (isAdmin) {
      setAvailableTypes([...ALL_GAME_TYPES]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/game_types.php?action=list`);
        if (!res.ok) return;
        const json = await res.json();
        const codes = (json.game_types || []).map((g: { code: string }) => g.code);
        if (cancelled || !codes.length) return;
        setAvailableTypes(codes);
        setGameType((cur) => (codes.includes(cur) ? cur : codes[0]));
      } catch {
        /* keep the default full list on failure */
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const generateUniqid = () => {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert(t('creator.validationTitle'));
      return;
    }

    setSaving(true);
    try {
      const newUniqid = generateUniqid();
      // Client-authored scenarios must be owned by the current client. Admin-authored
      // scenarios stay with client_id = NULL (Taghunter product template).
      const clientIdForInsert = !isAdmin ? authService.getClientId() : undefined;

      // A new scenario's first language defaults to the author's language: the
      // client's account language for client-authored scenarios, and 'fr' for
      // admin/product scenarios (deterministic regardless of which admin edits).
      // The existing ScenarioEditorShell hydration reads default_language /
      // available_languages straight off `data`. Design: project_client_language.
      const clientLang = !isAdmin ? authService.getClientLanguage() : null;
      const defaultLanguage = (clientLang && ['fr', 'en', 'es'].includes(clientLang)) ? clientLang : 'fr';

      const scenarioData = {
        title: title.trim(),
        game_type: gameType,
        description: '',
        status,
        scenario_type: scenarioType,
        client_id: clientIdForInsert,
        // MySQL DATETIME format (YYYY-MM-DD HH:MM:SS) - not ISO 8601 with T/Z.
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        data: { default_language: defaultLanguage, available_languages: [defaultLanguage] },
        medias: {
          images: {},
          sounds: {},
          videos: {},
          enigmas: [],
          levels: {},
          overscores: []
        },
        uniqid: newUniqid
      };

      const { data, error } = await db
        .from('scenarios')
        .insert([scenarioData])
        .select('id, uniqid')
        .single();

      if (error) throw error;
      const returnedUniqid = data?.uniqid || newUniqid;
      if (returnedUniqid) {
        onSave(returnedUniqid, gameType);
      }
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert(t('creator.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          aria-label={t('creator.back')}
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-3xl font-bold text-white">{t('creator.heading')}</h2>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {t('creator.titleLabel')}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder={t('creator.titlePlaceholder')}
          />
        </div>

        {/* Scenario Type (custom/product) is an admin-only concept. Clients
            always author "custom" scenarios, so the picker is hidden for them
            and the default `scenarioType` state ('custom') is used as-is. */}
        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {t('creator.scenarioTypeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              {(['custom', 'product'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setScenarioType(type)}
                  className={`px-4 py-3 rounded-lg border-2 transition ${
                    scenarioType === type
                      ? 'border-blue-500 bg-blue-500/20 text-white'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="font-semibold capitalize">{type}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {t('creator.gameTypeLabel')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            {availableTypes.map((type) => (
              <button
                key={type}
                onClick={() => setGameType(type)}
                className={`px-4 py-3 rounded-lg border-2 transition ${
                  gameType === type
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold capitalize">{GAME_TYPE_LABELS[type] || type}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {t('creator.statusLabel')}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'archived')}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="draft">{t('creator.statusDraft')}</option>
            <option value="published">{t('creator.statusPublished')}</option>
            <option value="archived">{t('creator.statusArchived')}</option>
          </select>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? t('creator.saving') : t('creator.save')}
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            {t('creator.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
