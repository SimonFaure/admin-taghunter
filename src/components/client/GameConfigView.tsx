import { Volume2, Monitor, Gamepad2, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function GameConfigView() {
  const { t } = useTranslation();
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
          {t('clientGameConfig:gameConfig.subtitle')}
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <Volume2 className="w-5 h-5 text-slate-900" />
          <h3 className="text-lg font-bold text-slate-900">{t('clientGameConfig:gameConfig.audioSettings')}</h3>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">{t('clientGameConfig:gameConfig.soundEnabled')}</label>
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
              {t('clientGameConfig:gameConfig.musicVolume', { volume: config.musicVolume })}
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
              {t('clientGameConfig:gameConfig.sfxVolume', { volume: config.sfxVolume })}
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
          <h3 className="text-lg font-bold text-slate-900">{t('clientGameConfig:gameConfig.displaySettings')}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">{t('clientGameConfig:gameConfig.displayMode')}</label>
            <select
              value={config.displayMode}
              onChange={(e) => setConfig({ ...config, displayMode: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="fullscreen">{t('clientGameConfig:gameConfig.fullscreen')}</option>
              <option value="windowed">{t('clientGameConfig:gameConfig.windowed')}</option>
              <option value="borderless">{t('clientGameConfig:gameConfig.borderless')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <Gamepad2 className="w-5 h-5 text-slate-900" />
          <h3 className="text-lg font-bold text-slate-900">{t('clientGameConfig:gameConfig.gameplaySettings')}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">{t('clientGameConfig:gameConfig.difficulty')}</label>
            <select
              value={config.difficulty}
              onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="easy">{t('clientGameConfig:gameConfig.easy')}</option>
              <option value="normal">{t('clientGameConfig:gameConfig.normal')}</option>
              <option value="hard">{t('clientGameConfig:gameConfig.hard')}</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">{t('clientGameConfig:gameConfig.autoSave')}</label>
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
            <label className="text-sm font-medium text-slate-700">{t('clientGameConfig:gameConfig.notifications')}</label>
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
          <span>{t('clientGameConfig:gameConfig.saveConfiguration')}</span>
        </button>
      </div>
    </div>
  );
}
