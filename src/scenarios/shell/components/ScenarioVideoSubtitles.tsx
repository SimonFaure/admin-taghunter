/**
 * Per-language `.vtt` subtitle tracks for the scenario intro video.
 *
 * One slot per supported language (`scenario_video_subtitle_<lang>`, declared
 * in commonMediaSlots). Files upload like any other sound-bucket asset and are
 * persisted in `medias.sounds` on the next save; the playground picks them up
 * with the rest of the scenario media and offers them in its video player.
 *
 * Two pieces, both reading the tracks straight from gameMeta:
 *   - ScenarioVideoPlayer    : the video preview, with a subtitle-language picker
 *   - ScenarioVideoSubtitles : the track manager (add / replace / remove)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Subtitles } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { scenarioVideoSubtitleKey } from '../commonMediaSlots';
import { LANGUAGES, SUPPORTED_LANGS, type Lang } from '../../../i18n/languages';

/** A WebVTT file must open with the "WEBVTT" signature (after an optional BOM). */
async function isWebVtt(file: File): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith('.vtt')) return false;
  const head = await file.slice(0, 16).text();
  return (head.charCodeAt(0) === 0xfeff ? head.slice(1) : head).startsWith('WEBVTT');
}

function useSubtitleTracks() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const fileFor = (lang: Lang) => String(meta[scenarioVideoSubtitleKey(lang)] ?? '');
  const langsWithTrack = SUPPORTED_LANGS.filter((lang) => fileFor(lang) !== '');
  return { editor, meta, fileFor, langsWithTrack };
}

function VttPicker({
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
        accept=".vtt,text/vtt"
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

/** Scenario video preview with a selectable subtitle track. */
export function ScenarioVideoPlayer({ video }: { video: string }) {
  const { t } = useTranslation('editorSections1');
  const { editor, fileFor, langsWithTrack } = useSubtitleTracks();
  const videoRef = useRef<HTMLVideoElement>(null);
  // null = no explicit choice yet: follow the language being edited, like the
  // playground follows the app language.
  const [choice, setChoice] = useState<string | null>(null);

  const hasTrack = (lang: string) => (langsWithTrack as readonly string[]).includes(lang);
  const selected =
    choice !== null && (choice === 'off' || hasTrack(choice))
      ? choice
      : hasTrack(editor.currentLanguage)
        ? editor.currentLanguage
        : 'off';

  // Show only the chosen subtitle track, disable the rest.
  const applyTrack = useCallback((lang: string) => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const tr = v.textTracks[i];
      tr.mode = lang !== 'off' && tr.language === lang ? 'showing' : 'disabled';
    }
  }, []);

  const trackSignature = langsWithTrack.map((lang) => fileFor(lang)).join('|');
  useEffect(() => {
    applyTrack(selected);
  }, [selected, trackSignature, applyTrack]);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        key={`${video}|${trackSignature}`}
        src={editor.getMediaUrl(video)}
        controls
        preload="metadata"
        className="w-full max-h-80 rounded-lg bg-black"
        onLoadedMetadata={() => applyTrack(selected)}
      >
        {langsWithTrack.map((lang) => (
          <track
            key={lang}
            kind="subtitles"
            srcLang={lang}
            label={LANGUAGES[lang].nativeName}
            src={editor.getMediaUrl(fileFor(lang))}
          />
        ))}
      </video>
      <div className="flex items-center gap-2 text-sm">
        <Subtitles className="w-4 h-4 text-gray-400" />
        <label htmlFor="scenario-video-subtitle-select" className="text-gray-600">
          {t('cover.subtitles.selectLabel')}
        </label>
        {langsWithTrack.length > 0 ? (
          <select
            id="scenario-video-subtitle-select"
            value={selected}
            onChange={(e) => setChoice(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            <option value="off">{t('cover.subtitles.off')}</option>
            {langsWithTrack.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGES[lang].nativeName}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-400">{t('cover.subtitles.none')}</span>
        )}
      </div>
    </div>
  );
}

/** Subtitle track manager: the uploaded languages, plus an "add a language" row. */
export function ScenarioVideoSubtitles() {
  const { t } = useTranslation('editorSections1');
  const { editor, meta, fileFor, langsWithTrack } = useSubtitleTracks();
  const video = String(meta.scenario_video ?? '');

  const [busyLang, setBusyLang] = useState<Lang | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addChoice, setAddChoice] = useState<Lang | null>(null);

  // Languages still without a track - the scenario's own languages first.
  const missingLangs = [
    ...SUPPORTED_LANGS.filter((l) => editor.availableLanguages.includes(l)),
    ...SUPPORTED_LANGS.filter((l) => !editor.availableLanguages.includes(l)),
  ].filter((lang) => fileFor(lang) === '');
  const addLang = addChoice && missingLangs.includes(addChoice) ? addChoice : missingLangs[0];

  const setTrack = (lang: Lang, filename: string) =>
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), [scenarioVideoSubtitleKey(lang)]: filename }) as typeof m,
    );

  async function upload(lang: Lang, file: File) {
    setError(null);
    if (!(await isWebVtt(file))) {
      setError(t('cover.subtitles.notVtt'));
      return;
    }
    setBusyLang(lang);
    try {
      const previous = fileFor(lang);
      const filename = await editor.uploadAsset(scenarioVideoSubtitleKey(lang), file);
      setTrack(lang, filename);
      // Queue the replaced file for cleanup (unlinked after the next save).
      if (previous && previous !== filename) editor.deleteAsset(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cover.subtitles.uploadFailed'));
    } finally {
      setBusyLang(null);
    }
  }

  function remove(lang: Lang) {
    const previous = fileFor(lang);
    if (previous) editor.deleteAsset(previous);
    setTrack(lang, '');
  }

  // Subtitles only make sense on a video; keep the block reachable when tracks
  // outlive a removed video so they can still be cleaned up.
  if (!video && langsWithTrack.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <Subtitles className="w-4 h-4 text-gray-400" />
        {t('cover.subtitles.title')}
        <span className="ml-auto text-xs font-normal text-gray-500">
          {t('cover.subtitles.count', { count: langsWithTrack.length })}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{t('cover.subtitles.hint')}</p>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}

      <div className="mt-2 space-y-1 text-sm">
        {langsWithTrack.length === 0 && (
          <div className="text-xs text-gray-400 italic py-1">{t('cover.subtitles.empty')}</div>
        )}
        {langsWithTrack.map((lang) => (
          <div key={lang} className="flex items-center gap-2 py-1 px-2 -mx-2 hover:bg-gray-50 rounded">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-gray-700 truncate min-w-0" title={fileFor(lang)}>
              {LANGUAGES[lang].nativeName} <span className="text-xs text-gray-400">({lang})</span>
            </span>
            <span className="ml-auto flex items-center gap-1 shrink-0">
              <VttPicker
                label={busyLang === lang ? '...' : t('cover.subtitles.replace')}
                disabled={busyLang !== null}
                onFile={(f) => upload(lang, f)}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => remove(lang)}
                disabled={busyLang !== null}
                className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
              >
                {t('cover.subtitles.remove')}
              </button>
            </span>
          </div>
        ))}
      </div>

      {addLang && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 text-sm">
          <label htmlFor="scenario-video-subtitle-add" className="text-gray-600 shrink-0">
            {t('cover.subtitles.addLabel')}
          </label>
          <select
            id="scenario-video-subtitle-add"
            value={addLang}
            onChange={(e) => setAddChoice(e.target.value as Lang)}
            disabled={busyLang !== null}
            className="min-w-0 border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            {missingLangs.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGES[lang].nativeName}
              </option>
            ))}
          </select>
          <span className="ml-auto shrink-0">
            <VttPicker
              label={busyLang === addLang ? '...' : t('cover.subtitles.upload')}
              disabled={busyLang !== null}
              onFile={(f) => upload(addLang, f)}
              className="text-xs px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            />
          </span>
        </div>
      )}
    </div>
  );
}
