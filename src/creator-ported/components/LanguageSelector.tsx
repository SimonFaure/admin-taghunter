import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  availableLanguages: string[];
  currentLanguage: string;
  onLanguageChange: (language: string) => void;
  onAddLanguage: () => void;
  onRemoveLanguage: (language: string) => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'fr': 'Français',
  'es': 'Español',
  'de': 'Deutsch',
  'it': 'Italiano',
  'pt': 'Português',
  'nl': 'Nederlands',
  'pl': 'Polski',
  'ru': 'Русский',
  'ja': '日本語',
  'zh': '中文',
  'ar': 'العربية'
};

const AVAILABLE_LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES);

export function LanguageSelector({
  availableLanguages,
  currentLanguage,
  onLanguageChange,
  onAddLanguage,
  onRemoveLanguage
}: LanguageSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-600" />
          <h3 className="font-medium text-gray-900">Languages</h3>
        </div>
        <button
          onClick={onAddLanguage}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Language
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {availableLanguages.map(lang => (
          <button
            key={lang}
            onClick={() => onLanguageChange(lang)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
              ${currentLanguage === lang
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            <span className="font-medium">{lang.toUpperCase()}</span>
            <span className="text-sm opacity-90">
              {LANGUAGE_NAMES[lang] || lang}
            </span>
            {availableLanguages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveLanguage(lang);
                }}
                className={`
                  ml-1 w-4 h-4 rounded-full flex items-center justify-center text-xs
                  ${currentLanguage === lang
                    ? 'hover:bg-blue-700'
                    : 'hover:bg-gray-300'
                  }
                `}
                title="Remove language"
              >
                ×
              </button>
            )}
          </button>
        ))}
      </div>

      {availableLanguages.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-2">
          No languages configured. Add a language to get started.
        </p>
      )}
    </div>
  );
}

interface AddLanguageModalProps {
  availableLanguages: string[];
  onSelect: (language: string) => void;
  onClose: () => void;
}

export function AddLanguageModal({
  availableLanguages,
  onSelect,
  onClose
}: AddLanguageModalProps) {
  const unusedLanguages = AVAILABLE_LANGUAGE_CODES.filter(
    code => !availableLanguages.includes(code)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Add Language
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {unusedLanguages.map(code => (
              <button
                key={code}
                onClick={() => onSelect(code)}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-gray-900">
                  {LANGUAGE_NAMES[code]}
                </span>
                <span className="text-sm text-gray-500 uppercase">
                  {code}
                </span>
              </button>
            ))}
          </div>

          {unusedLanguages.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              All available languages have been added.
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
