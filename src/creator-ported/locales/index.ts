import en from './en.json';
import fr from './fr.json';

export type Language = 'en' | 'fr';

export type TranslationKeys = typeof en;

export const translations: Record<Language, TranslationKeys> = {
  en,
  fr,
};

export const supportedLanguages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
];

export const defaultLanguage: Language = 'fr';
