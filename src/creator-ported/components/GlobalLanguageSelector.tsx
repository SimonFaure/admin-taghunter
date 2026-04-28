import { Globe } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { supportedLanguages } from '../locales';

export function GlobalLanguageSelector() {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="relative inline-block">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'fr')}
        className="appearance-none bg-slate-800 border border-slate-700 text-white rounded-lg pl-10 pr-8 py-2 text-sm focus:outline-none focus:border-blue-500 hover:bg-slate-750 transition-colors cursor-pointer"
      >
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </select>
      <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
