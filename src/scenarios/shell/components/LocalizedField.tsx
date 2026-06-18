/**
 * Slot-style field for editing a `Localized<string>` value. Reads + writes
 * `value[currentLanguage]` (via the runtime fallback chain) using the
 * shell's `currentLanguage` from context.
 *
 * Slice 3A: scaffold. Not yet imported by any section. Slice 3B will swap
 * every plain `<input>` over translatable game_meta fields to this component.
 *
 * Tolerates being passed a plain string (legacy data) — treats it as
 * `{ [defaultLanguage]: value }` until next save.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../useScenarioEditor';
import { getLocalized, setLocalized } from '../../i18n/getLocalized';
import type { Lang, Localized } from '../../i18n/types';

interface LocalizedFieldProps {
  label?: string;
  value: Localized<string> | string | undefined;
  onChange: (next: Localized<string>) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}

export function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
  rows = 2,
  placeholder,
  className = '',
}: LocalizedFieldProps) {
  const { t } = useTranslation('editor');
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  const current = getLocalized(value, lang, defaultLang);

  const handleChange = (next: string) => {
    onChange(setLocalized(value, lang, next, defaultLang));
  };

  const inputClass = `w-full px-3 py-2 border border-gray-300 rounded-md text-sm ${className}`.trim();

  return (
    <label className="block">
      {label && (
        <span className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          <span>{label}</span>
          <span
            className="text-[10px] uppercase tracking-wide text-gray-400 font-mono"
            title={lang === defaultLang ? t('field.defaultLanguageTitle', { lang }) : t('field.translationTitle', { lang })}
          >
            {lang}
          </span>
        </span>
      )}
      {multiline ? (
        <textarea
          value={current}
          onChange={(e) => handleChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={current}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </label>
  );
}
