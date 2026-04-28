// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState } from 'react';
import { Settings, Book, Database, FileText, Upload, Download, AlertCircle, CheckCircle, Layout, X, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { ScenarioTypeSelector } from './ScenarioTypeSelector';
import { ScenarioSelector } from './ScenarioSelector';

interface ConfigPageProps {
  onNavigate: (page: 'api-docs' | 'api-logs' | 'import-logs' | 'default-config' | 'admin-config' | 'clients') => void;
  onNavigateWithGameType?: (page: 'default-config', gameType: 'tagquest' | 'mystery' | 'tracks') => void;
  onOpenLayoutEditor?: (scenarioType: string, layoutType?: 'instruction' | 'game', scenarioId?: string) => void;
  isAdmin: boolean;
}

export function ConfigPage({ onNavigate, onNavigateWithGameType, onOpenLayoutEditor, isAdmin }: ConfigPageProps) {
  const { t, language, setLanguage } = useTranslation();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showScenarioTypeSelector, setShowScenarioTypeSelector] = useState<string | null>(null);
  const [showScenarioSelector, setShowScenarioSelector] = useState<'tagquest' | 'mystery' | 'tracks' | null>(null);
  const [selectedScenarioForLayout, setSelectedScenarioForLayout] = useState<{ gameType: string; scenarioId: string } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.json')) {
      setImportFile(file);
      setImportStatus(null);
    } else {
      setImportStatus({ type: 'error', message: t('config.invalidFileType') });
    }
  };

  const handleImportTranslations = async () => {
    if (!importFile) return;

    try {
      const text = await importFile.text();
      const translations = JSON.parse(text);

      const targetLanguage = importFile.name.includes('en.json') ? 'en' : 'fr';
      const localStorageKey = `custom_translations_${targetLanguage}`;

      localStorage.setItem(localStorageKey, JSON.stringify(translations));

      setImportStatus({
        type: 'success',
        message: t('config.importSuccess', { lang: targetLanguage.toUpperCase() })
      });
      setImportFile(null);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      setImportStatus({ type: 'error', message: t('config.importError') });
    }
  };

  const handleExportTranslations = (lang: 'en' | 'fr') => {
    const customKey = `custom_translations_${lang}`;
    const customTranslations = localStorage.getItem(customKey);

    let translations;
    if (customTranslations) {
      translations = customTranslations;
    } else {
      import(`../locales/${lang}.json`).then((module) => {
        const blob = new Blob([JSON.stringify(module.default, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${lang}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
      return;
    }

    const blob = new Blob([translations], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-xl shadow-lg p-8 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-blue-400" size={32} />
          <h2 className="text-3xl font-bold text-white">{t('config.title')}</h2>
        </div>

        {isAdmin && (
          <div className="space-y-6 mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">{t('config.adminTools')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => onNavigate('admin-config')}
                className="flex items-center gap-3 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-red-500"
              >
                <ShieldCheck className="text-red-400" size={24} />
                <div className="text-left">
                  <div className="text-white font-semibold">Admin Configuration</div>
                  <div className="text-slate-400 text-sm">Manage clients and connections</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('clients')}
                className="flex items-center gap-3 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-blue-500"
              >
                <Users className="text-blue-400" size={24} />
                <div className="text-left">
                  <div className="text-white font-semibold">Clients</div>
                  <div className="text-slate-400 text-sm">View and manage all clients</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('api-docs')}
                className="flex items-center gap-3 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-blue-500"
              >
                <Book className="text-blue-400" size={24} />
                <div className="text-left">
                  <div className="text-white font-semibold">{t('admin.documentation')}</div>
                  <div className="text-slate-400 text-sm">{t('config.viewApiDocs')}</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('api-logs')}
                className="flex items-center gap-3 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-green-500"
              >
                <Database className="text-green-400" size={24} />
                <div className="text-left">
                  <div className="text-white font-semibold">{t('admin.apiLogs')}</div>
                  <div className="text-slate-400 text-sm">{t('config.viewApiLogs')}</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('import-logs')}
                className="flex items-center gap-3 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-purple-500"
              >
                <FileText className="text-purple-400" size={24} />
                <div className="text-left">
                  <div className="text-white font-semibold">{t('admin.importLogs')}</div>
                  <div className="text-slate-400 text-sm">{t('config.viewImportLogs')}</div>
                </div>
              </button>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Layout className="text-orange-400" size={24} />
                Default Config & Layout Editor
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                Configure default values and layouts for each game type
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <button
                    onClick={() => onNavigateWithGameType?.('default-config', 'tagquest')}
                    className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-left"
                  >
                    <div className="font-semibold">TagQuest</div>
                    <div className="text-xs text-slate-300 mt-1">Default configuration</div>
                  </button>
                  <button
                    onClick={() => setShowScenarioSelector('tagquest')}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Layout size={16} />
                    Layout Editor
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => onNavigateWithGameType?.('default-config', 'mystery')}
                    className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-left"
                  >
                    <div className="font-semibold">Mystery</div>
                    <div className="text-xs text-slate-300 mt-1">Default configuration</div>
                  </button>
                  <button
                    onClick={() => setShowScenarioSelector('mystery')}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Layout size={16} />
                    Layout Editor
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => onNavigateWithGameType?.('default-config', 'tracks')}
                    className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-left"
                  >
                    <div className="font-semibold">Tracks</div>
                    <div className="text-xs text-slate-300 mt-1">Default configuration</div>
                  </button>
                  <button
                    onClick={() => setShowScenarioSelector('tracks')}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Layout size={16} />
                    Layout Editor
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-xl font-semibold text-white mb-4">{t('config.translations')}</h3>

          <div className="space-y-4">
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Upload className="text-blue-400" size={20} />
                {t('config.importTranslations')}
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                {t('config.importTranslationsDesc')}
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="translation-file"
                  />
                  <label
                    htmlFor="translation-file"
                    className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg cursor-pointer transition-colors text-center"
                  >
                    {importFile ? importFile.name : t('config.selectFile')}
                  </label>
                  {importFile && (
                    <button
                      onClick={handleImportTranslations}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      {t('common.import')}
                    </button>
                  )}
                </div>

                {importStatus && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    importStatus.type === 'success'
                      ? 'bg-green-900/30 border border-green-700 text-green-400'
                      : 'bg-red-900/30 border border-red-700 text-red-400'
                  }`}>
                    {importStatus.type === 'success' ? (
                      <CheckCircle size={20} />
                    ) : (
                      <AlertCircle size={20} />
                    )}
                    <span>{importStatus.message}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Download className="text-green-400" size={20} />
                {t('config.exportTranslations')}
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                {t('config.exportTranslationsDesc')}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleExportTranslations('en')}
                  className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                >
                  {t('config.exportEnglish')}
                </button>
                <button
                  onClick={() => handleExportTranslations('fr')}
                  className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                >
                  {t('config.exportFrench')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showScenarioTypeSelector && (
        <ScenarioTypeSelector
          onSelect={(scenarioType, layoutType) => {
            setShowScenarioTypeSelector(null);
            if (onOpenLayoutEditor) {
              onOpenLayoutEditor(scenarioType, layoutType);
            }
          }}
          onClose={() => setShowScenarioTypeSelector(null)}
          filterGameType={showScenarioTypeSelector as 'tagquest' | 'mystery' | 'tracks'}
        />
      )}

      {showScenarioSelector && (
        <ScenarioSelector
          gameType={showScenarioSelector}
          onSelect={(scenarioId) => {
            const gameType = showScenarioSelector;
            setShowScenarioSelector(null);

            // For mystery and tracks, show layout type selector
            if (gameType === 'mystery' || gameType === 'tracks') {
              setSelectedScenarioForLayout({ gameType, scenarioId });
            } else {
              // For tagquest, open layout editor directly
              if (onOpenLayoutEditor) {
                onOpenLayoutEditor(gameType, undefined, scenarioId);
              }
            }
          }}
          onClose={() => setShowScenarioSelector(null)}
        />
      )}

      {selectedScenarioForLayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Select Layout Type</h2>
              <button
                onClick={() => setSelectedScenarioForLayout(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  if (onOpenLayoutEditor) {
                    onOpenLayoutEditor(
                      selectedScenarioForLayout.gameType,
                      'instruction',
                      selectedScenarioForLayout.scenarioId
                    );
                  }
                  setSelectedScenarioForLayout(null);
                }}
                className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white"
              >
                Instruction Layout
              </button>
              <button
                onClick={() => {
                  if (onOpenLayoutEditor) {
                    onOpenLayoutEditor(
                      selectedScenarioForLayout.gameType,
                      'game',
                      selectedScenarioForLayout.scenarioId
                    );
                  }
                  setSelectedScenarioForLayout(null);
                }}
                className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white"
              >
                Game Layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
