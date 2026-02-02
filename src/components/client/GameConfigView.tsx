import { Settings, Volume2, Monitor, Gamepad2, Save } from 'lucide-react';
import { useState } from 'react';

export function GameConfigView() {
  const [config, setConfig] = useState({
    soundEnabled: true,
    musicVolume: 70,
    sfxVolume: 80,
    displayMode: 'fullscreen',
    difficulty: 'normal',
    autoSave: true,
    notifications: true,
  });

  const handleSave = () => {
    console.log('Saving configuration:', config);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <p className="text-slate-600">
          Configure your game settings and preferences
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <Volume2 className="w-5 h-5 text-slate-900" />
          <h3 className="text-lg font-bold text-slate-900">Audio Settings</h3>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Sound Enabled</label>
            <button
              onClick={() => setConfig({ ...config, soundEnabled: !config.soundEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.soundEnabled ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  config.soundEnabled ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Music Volume: {config.musicVolume}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.musicVolume}
              onChange={(e) => setConfig({ ...config, musicVolume: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              SFX Volume: {config.sfxVolume}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.sfxVolume}
              onChange={(e) => setConfig({ ...config, sfxVolume: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <Monitor className="w-5 h-5 text-slate-900" />
          <h3 className="text-lg font-bold text-slate-900">Display Settings</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Display Mode</label>
            <select
              value={config.displayMode}
              onChange={(e) => setConfig({ ...config, displayMode: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="fullscreen">Fullscreen</option>
              <option value="windowed">Windowed</option>
              <option value="borderless">Borderless Window</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <Gamepad2 className="w-5 h-5 text-slate-900" />
          <h3 className="text-lg font-bold text-slate-900">Gameplay Settings</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Difficulty</label>
            <select
              value={config.difficulty}
              onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Auto Save</label>
            <button
              onClick={() => setConfig({ ...config, autoSave: !config.autoSave })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.autoSave ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  config.autoSave ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Notifications</label>
            <button
              onClick={() => setConfig({ ...config, notifications: !config.notifications })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.notifications ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  config.notifications ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Save Configuration</span>
        </button>
      </div>
    </div>
  );
}
