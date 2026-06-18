/**
 * Chip-style free-text tag input for scenario `univers` tags.
 *
 * Plain strings (not localized). Offers autocomplete suggestions from a pool the
 * caller supplies (the client's already-used tags) but accepts any new typed tag.
 * Add a tag with Enter or comma; remove with the × on a chip or Backspace on an
 * empty input.
 */

import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeUnivers } from '../../../types/univers';

interface UniversTagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pool of suggested tags (e.g. the client's existing univers). */
  suggestions?: string[];
  placeholder?: string;
}

export function UniversTagInput({ value, onChange, suggestions = [], placeholder }: UniversTagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = normalizeUnivers(value);
  const lowerTags = useMemo(() => new Set(tags.map((t) => t.toLowerCase())), [tags]);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !lowerTags.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [draft, suggestions, lowerTags]);

  const addTag = (raw: string) => {
    const next = normalizeUnivers([...tags, raw]);
    onChange(next);
    setDraft('');
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) addTag(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded-md min-h-[38px] focus-within:ring-2 focus-within:ring-blue-500">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-violet-950"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && addTag(draft)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[8ch] text-sm outline-none bg-transparent py-0.5"
        />
      </div>
      {draft.trim() && matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="px-2 py-0.5 rounded-full text-xs border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
