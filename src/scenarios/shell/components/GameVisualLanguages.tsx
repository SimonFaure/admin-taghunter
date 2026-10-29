/**
 * "Other languages" version of the game cover visual.
 *
 * `game_visual` (the main cover field) is the French cover. A licensee whose
 * account language is anything else sees the version uploaded here
 * (`game_visual_intl`, declared in commonMediaSlots) instead, in the Studio and
 * on the Playground; with no version, everyone gets the main cover. The file is
 * an ordinary image-bucket asset, persisted in `medias.images` on the next save.
 *
 * Per-language versions (`game_visual_<lang>`) left over from the earlier
 * one-per-language model are no longer shown anywhere; they are listed so they
 * can be removed.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Languages } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { GAME_VISUAL_INTL_KEY, gameVisualLangKey } from '../commonMediaSlots';
import { LANGUAGES, SUPPORTED_LANGS } from '../../../i18n/languages';

function ImagePicker({
  label,
  className,
  disabled,
  onFile,
}: {
  label: string;
  className: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className={className}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function GameVisualLanguages() {
  const { t } = useTranslation('editorSections1');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileFor = (key: string) => String(meta[key] ?? '');
  const intlFile = fileFor(GAME_VISUAL_INTL_KEY);
  const legacyKeys = SUPPORTED_LANGS.map(gameVisualLangKey).filter((key) => fileFor(key) !== '');

  const setFile = (key: string, filename: string) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: filename }) as typeof m);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError(t('cover.visualLangs.notImage'));
      return;
    }
    setBusy(true);
    try {
      const filename = await editor.uploadAsset(GAME_VISUAL_INTL_KEY, file);
      setFile(GAME_VISUAL_INTL_KEY, filename);
      // Queue the replaced file for cleanup (unlinked after the next save).
      if (intlFile && intlFile !== filename) editor.deleteAsset(intlFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cover.visualLangs.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  function remove(key: string) {
    const previous = fileFor(key);
    if (previous) editor.deleteAsset(previous);
    setFile(key, '');
  }

  const preview = (filename: string) => (
    <>
      <img
        src={editor.getMediaUrl(filename)}
        alt=""
        className="h-12 w-20 object-cover rounded border border-gray-100 shrink-0"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
      />
      <span className="text-gray-600 truncate min-w-0">{filename}</span>
    </>
  );

  const removeButton = (key: string) => (
    <button
      type="button"
      onClick={() => remove(key)}
      disabled={busy}
      className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
    >
      {t('cover.visualLangs.remove')}
    </button>
  );

  return (
    <div className="mt-3 border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 rounded-lg"
      >
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <Languages className="w-4 h-4 text-gray-400" />
        {t('cover.visualLangs.title')}
        <span className="ml-auto text-xs font-normal text-gray-500">
          {intlFile ? t('cover.visualLangs.set') : t('cover.visualLangs.notSet')}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-3">
          <p className="text-xs text-gray-500">{t('cover.visualLangs.hint')}</p>
          {error && <div className="text-xs text-red-600">{error}</div>}

          <div className="flex items-center gap-3 py-1.5 px-2 hover:bg-gray-50 rounded text-sm">
            <span className="w-32 shrink-0 text-gray-700">{t('cover.visualLangs.otherLanguages')}</span>
            {intlFile ? (
              <>
                {preview(intlFile)}
                <span className="ml-auto flex items-center gap-1 shrink-0">
                  <ImagePicker
                    label={busy ? '...' : t('cover.visualLangs.replace')}
                    disabled={busy}
                    onFile={upload}
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
                  />
                  {removeButton(GAME_VISUAL_INTL_KEY)}
                </span>
              </>
            ) : (
              <>
                <span className="text-gray-400">{t('cover.visualLangs.usesDefault')}</span>
                <span className="ml-auto shrink-0">
                  <ImagePicker
                    label={busy ? '...' : t('cover.visualLangs.upload')}
                    disabled={busy}
                    onFile={upload}
                    className="text-xs px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                  />
                </span>
              </>
            )}
          </div>

          {legacyKeys.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="text-xs text-amber-700">{t('cover.visualLangs.legacyHint')}</p>
              {legacyKeys.map((key) => {
                const lang = key.slice('game_visual_'.length) as keyof typeof LANGUAGES;
                return (
                  <div key={key} className="flex items-center gap-3 py-1.5 px-2 hover:bg-gray-50 rounded">
                    <span className="w-32 shrink-0 text-gray-500">
                      {LANGUAGES[lang]?.nativeName ?? lang} <span className="text-xs text-gray-400">({lang})</span>
                    </span>
                    {preview(fileFor(key))}
                    <span className="ml-auto shrink-0">{removeButton(key)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
