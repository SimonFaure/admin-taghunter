import { X } from 'lucide-react';

interface ScenarioTypeSelectorProps {
  onSelect: (scenarioType: string, layoutType?: 'instruction' | 'game') => void;
  onClose: () => void;
  filterGameType?: 'tagquest' | 'mystery' | 'tracks';
}

export function ScenarioTypeSelector({ onSelect, onClose, filterGameType }: ScenarioTypeSelectorProps) {
  const allScenarioTypes = [
    { value: 'ado_adultes', label: 'Mystery - Ado/Adultes', hasTwoLayouts: true, gameType: 'mystery' },
    { value: 'kids', label: 'Mystery - Kids', hasTwoLayouts: true, gameType: 'mystery' },
    { value: 'mini_kids', label: 'Mystery - Mini Kids', hasTwoLayouts: true, gameType: 'mystery' },
    { value: 'tagquest', label: 'TagQuest', hasTwoLayouts: false, gameType: 'tagquest' },
  ];

  const scenarioTypes = filterGameType
    ? allScenarioTypes.filter(type => type.gameType === filterGameType)
    : allScenarioTypes;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Select Scenario Type</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-3">
          {scenarioTypes.map((type) => (
            <div key={type.value} className="space-y-2">
              {type.hasTwoLayouts ? (
                <>
                  <button
                    onClick={() => onSelect(type.value, 'instruction')}
                    className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white"
                  >
                    {type.label} - Instruction Layout
                  </button>
                  <button
                    onClick={() => onSelect(type.value, 'game')}
                    className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white"
                  >
                    {type.label} - Game Layout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onSelect(type.value)}
                  className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-white"
                >
                  {type.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
