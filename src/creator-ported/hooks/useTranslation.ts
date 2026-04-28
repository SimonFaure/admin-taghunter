import { useContext } from 'react';
import { LanguageContext } from '../contexts/LanguageContext';
import { translations, TranslationKeys } from '../locales';

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}` | `${K}.${NestedKeyOf<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

type TranslationKey = NestedKeyOf<TranslationKeys>;

export const useTranslation = () => {
  const { language, setLanguage } = useContext(LanguageContext);

  const getTranslations = (lang: string) => {
    const customKey = `custom_translations_${lang}`;
    const customTranslations = localStorage.getItem(customKey);

    if (customTranslations) {
      try {
        return JSON.parse(customTranslations);
      } catch {
        return translations[lang as keyof typeof translations];
      }
    }

    return translations[lang as keyof typeof translations];
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: any = getTranslations(language);

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = getTranslations('en');
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            return key;
          }
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    if (params) {
      return Object.entries(params).reduce(
        (acc, [paramKey, paramValue]) => acc.replace(`{${paramKey}}`, String(paramValue)),
        value
      );
    }

    return value;
  };

  return { t, language, setLanguage };
};
