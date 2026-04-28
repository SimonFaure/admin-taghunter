import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { Language, defaultLanguage } from '../locales';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const defaultContextValue: LanguageContextType = {
  language: defaultLanguage,
  setLanguage: () => {},
};

export const LanguageContext = createContext<LanguageContextType>(defaultContextValue);

const STORAGE_KEY = 'taghunter_language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'en' || stored === 'fr')) {
      return stored as Language;
    }

    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'fr' || browserLang === 'en') {
      return browserLang as Language;
    }

    return defaultLanguage;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
