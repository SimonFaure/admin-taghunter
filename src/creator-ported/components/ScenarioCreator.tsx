// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { db } from '../lib/db';
import { authService } from '../services/authService';

interface ScenarioCreatorProps {
  onBack: () => void;
  onSave: (scenarioId: string, gameType: string) => void;
  isAdmin: boolean;
}

export function ScenarioCreator({ onBack, onSave, isAdmin }: ScenarioCreatorProps) {
  const [title, setTitle] = useState('');
  const [gameType, setGameType] = useState<'mystery' | 'tagquest' | 'tracks'>('mystery');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [scenarioType, setScenarioType] = useState<'product' | 'custom'>('custom');
  const [saving, setSaving] = useState(false);

  const generateUniqid = () => {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please provide a title');
      return;
    }

    setSaving(true);
    try {
      const newUniqid = generateUniqid();
      // Client-authored scenarios must be owned by the current client. Admin-authored
      // scenarios stay with client_id = NULL (Taghunter product template).
      const clientIdForInsert = !isAdmin ? authService.getClientId() : undefined;

      const scenarioData = {
        title: title.trim(),
        game_type: gameType,
        description: '',
        status,
        scenario_type: scenarioType,
        client_id: clientIdForInsert,
        // MySQL DATETIME format (YYYY-MM-DD HH:MM:SS) — not ISO 8601 with T/Z.
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        data: {},
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
      alert('Failed to save scenario');
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
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-3xl font-bold text-white">Create New Scenario</h2>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="Enter scenario title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Scenario Type *
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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Game Type *
          </label>
          <div className="grid grid-cols-3 gap-4">
            {(['mystery', 'tagquest', 'tracks'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setGameType(type)}
                className={`px-4 py-3 rounded-lg border-2 transition ${
                  gameType === type
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold capitalize">{type}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'archived')}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Scenario'}
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
