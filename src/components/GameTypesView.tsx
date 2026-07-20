import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, Film, Subtitles, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { SUPPORTED_LANGS, type Lang } from '../scenarios/i18n/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

const VIDEO_ACCEPT = 'video/mp4,video/webm,video/ogg,video/quicktime';

// Effective upload ceiling on production (nginx client_max_body_size + PHP
// post_max_size/upload_max_filesize are both 256M). Keep in sync with the
// server config; the PHP code constant (700M) is larger but never reached.
const MAX_VIDEO_MB = 256;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  ja: '日本語',
  zh: '中文',
  ar: 'العربية',
};

interface GameType {
  code: string;
  name: string;
  supports_tutorial_video: boolean;
  supports_intro_video: boolean;
  tutorial_video_path: string | null;
  tutorial_video_version: number;
  tutorial_subtitles: Record<string, string>;
}

interface Override {
  game_type_code: string;
  tutorial_video_path: string | null;
  tutorial_video_version: number;
  tutorial_subtitles: Record<string, string>;
}

type Variant = 'admin' | 'client';

function buildMediaUrl(p: {
  code: string;
  variant: Variant;
  version: number;
  filename?: string;
  subtitleLang?: string;
  token: string | null;
}): string {
  const u = new URLSearchParams();
  u.set('action', 'get_media');
  u.set('code', p.code);
  u.set('variant', p.variant);
  u.set('version', String(p.version));
  if (p.filename) u.set('filename', p.filename);
  if (p.subtitleLang) u.set('subtitle_lang', p.subtitleLang);
  if (p.token) u.set('token', p.token);
  return `${API_BASE_URL}/game_types.php?${u.toString()}`;
}

/** A drop-zone wrapper that also opens the file picker on click. */
function FileDrop({
  accept,
  onFile,
  className = '',
  activeClassName = 'ring-2 ring-indigo-400 bg-indigo-50',
  children,
  title,
}: {
  accept: string;
  onFile: (file: File) => void;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      title={title}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`${className} ${over ? activeClassName : ''} cursor-pointer transition-colors`}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (e.target) e.target.value = '';
        }}
      />
    </div>
  );
}

/** Authenticated <video> player with a selectable subtitle track. */
function MediaVideo({
  code,
  variant,
  version,
  filename,
  subtitles,
  token,
}: {
  code: string;
  variant: Variant;
  version: number;
  filename: string;
  subtitles: Record<string, string>;
  token: string | null;
}) {
  const { t } = useTranslation('gameTypes');
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = buildMediaUrl({ code, variant, version, filename, token });
  const langs = Object.keys(subtitles || {});
  const [selected, setSelected] = useState<string>('off');

  // Show only the chosen subtitle track, disable the rest.
  const applyTrack = useCallback((lang: string) => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const tr = v.textTracks[i];
      tr.mode = lang !== 'off' && tr.language === lang ? 'showing' : 'disabled';
    }
  }, []);

  useEffect(() => { applyTrack(selected); }, [selected, applyTrack]);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        key={`${variant}-${version}-${filename}`}
        src={src}
        controls
        preload="metadata"
        className="w-full max-h-[28rem] rounded-lg bg-black shadow-inner"
        onLoadedMetadata={() => applyTrack(selected)}
      >
        {langs.map((lang) => (
          <track
            key={lang}
            kind="subtitles"
            srcLang={lang}
            label={LANG_NAMES[lang as Lang] || lang}
            src={buildMediaUrl({ code, variant, version, subtitleLang: lang, token })}
          />
        ))}
      </video>
      {langs.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Subtitles className="w-4 h-4 text-slate-500" />
          <label htmlFor={`subsel-${variant}-${code}`} className="text-slate-600">{t('card.subtitleSelectLabel')}</label>
          <select
            id={`subsel-${variant}-${code}`}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            <option value="off">{t('card.subtitleOff')}</option>
            {langs.map((lang) => (
              <option key={lang} value={lang}>{LANG_NAMES[lang as Lang] || lang}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function GameTypesView() {
  const { t } = useTranslation('gameTypes');
  const { user, token } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headersJson = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const headersMultipart = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/game_types.php?action=list`, { headers: headersJson });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const types = (json.game_types || []) as GameType[];
      types.forEach((t) => { if (!t.tutorial_subtitles || Array.isArray(t.tutorial_subtitles)) t.tutorial_subtitles = {}; });
      setGameTypes(types);
      const overs: Record<string, Override> = {};
      for (const o of (json.overrides ? Object.values(json.overrides) : []) as Override[]) {
        if (!o.tutorial_subtitles || Array.isArray(o.tutorial_subtitles)) o.tutorial_subtitles = {};
        overs[o.game_type_code] = o;
      }
      setOverrides(overs);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [headersJson, t]);

  useEffect(() => { load(); }, [load]);

  // Reject oversize videos before they hit the server (where they'd be bounced
  // with an opaque 413). Returns true when the file is within the limit.
  const checkVideoSize = (file: File): boolean => {
    if (file.size <= MAX_VIDEO_BYTES) return true;
    setError(t('error.fileTooLarge', {
      size: Math.ceil(file.size / (1024 * 1024)),
      max: MAX_VIDEO_MB,
    }));
    return false;
  };

  const handleAdminUploadVideo = async (code: string, file: File) => {
    if (!checkVideoSize(file)) return;
    const fd = new FormData();
    fd.append('code', code);
    fd.append('video', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_upload_video`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || t('error.uploadFailed')); return; }
    await load();
  };

  const handleAdminRemoveVideo = async (code: string) => {
    if (!confirm(t('confirm.adminRemoveVideo', { code }))) return;
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_remove_video`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code }),
    });
    if (!res.ok) { setError((await res.json()).error || t('error.removeFailed')); return; }
    await load();
  };

  const handleAdminUploadSubtitle = async (code: string, lang: Lang, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('lang', lang);
    fd.append('subtitle', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_upload_subtitle`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || t('error.uploadFailed')); return; }
    await load();
  };

  const handleAdminRemoveSubtitle = async (code: string, lang: Lang) => {
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_remove_subtitle`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code, lang }),
    });
    if (!res.ok) { setError((await res.json()).error || t('error.removeFailed')); return; }
    await load();
  };

  const handleClientUploadVideo = async (code: string, file: File) => {
    if (!checkVideoSize(file)) return;
    const fd = new FormData();
    fd.append('code', code);
    fd.append('video', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_upload_video`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || t('error.uploadFailed')); return; }
    await load();
  };

  const handleClientRemoveVideo = async (code: string) => {
    if (!confirm(t('confirm.clientRemoveVideo', { code }))) return;
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_remove_video`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code }),
    });
    if (!res.ok) { setError((await res.json()).error || t('error.removeFailed')); return; }
    await load();
  };

  const handleClientUploadSubtitle = async (code: string, lang: Lang, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('lang', lang);
    fd.append('subtitle', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_upload_subtitle`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || t('error.uploadFailed')); return; }
    await load();
  };

  const handleClientRemoveSubtitle = async (code: string, lang: Lang) => {
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_remove_subtitle`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code, lang }),
    });
    if (!res.ok) { setError((await res.json()).error || t('error.removeFailed')); return; }
    await load();
  };

  if (loading) return <div className="p-8 text-slate-500">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{isAdmin ? t('title') : t('titleClient')}</h2>
        <p className="text-slate-600 mt-1">
          {isAdmin ? t('description.admin') : t('description.client')}
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">{t('dismiss')}</button>
        </div>
      )}

      <div className="space-y-4">
        {gameTypes.map((gt) => (
          <GameTypeCard
            key={gt.code}
            gameType={gt}
            override={overrides[gt.code] || null}
            isAdmin={isAdmin}
            token={token}
            onAdminUploadVideo={handleAdminUploadVideo}
            onAdminRemoveVideo={handleAdminRemoveVideo}
            onAdminUploadSubtitle={handleAdminUploadSubtitle}
            onAdminRemoveSubtitle={handleAdminRemoveSubtitle}
            onClientUploadVideo={handleClientUploadVideo}
            onClientRemoveVideo={handleClientRemoveVideo}
            onClientUploadSubtitle={handleClientUploadSubtitle}
            onClientRemoveSubtitle={handleClientRemoveSubtitle}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  gameType: GameType;
  override: Override | null;
  isAdmin: boolean;
  token: string | null;
  onAdminUploadVideo: (code: string, file: File) => void;
  onAdminRemoveVideo: (code: string) => void;
  onAdminUploadSubtitle: (code: string, lang: Lang, file: File) => void;
  onAdminRemoveSubtitle: (code: string, lang: Lang) => void;
  onClientUploadVideo: (code: string, file: File) => void;
  onClientRemoveVideo: (code: string) => void;
  onClientUploadSubtitle: (code: string, lang: Lang, file: File) => void;
  onClientRemoveSubtitle: (code: string, lang: Lang) => void;
}

function GameTypeCard(props: CardProps) {
  const { t } = useTranslation('gameTypes');
  const { gameType: gt, override, isAdmin, token } = props;
  const [open, setOpen] = useState(true);
  const [subsOpen, setSubsOpen] = useState(false);

  const adminHasVideo = !!gt.tutorial_video_path;
  const clientHasOverride = !!override?.tutorial_video_path;

  // Subtitle source edited in this view (admin → legacy, client → override).
  const editableSubs = (isAdmin ? gt.tutorial_subtitles : override?.tutorial_subtitles) || {};
  const subCount = Object.keys(editableSubs).length;
  const hasPlayableVideo = isAdmin ? adminHasVideo : (clientHasOverride || adminHasVideo);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Collapsible header */}
      <div
        className="flex items-center justify-between p-5 select-none cursor-pointer hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-slate-900 truncate">{gt.name}</h3>
            <code className="text-xs text-slate-500">{t('card.codeLabel', { code: gt.code })}</code>
          </div>
          {gt.supports_tutorial_video && (
            <div className="hidden sm:flex items-center gap-2 ml-2">
              {hasPlayableVideo ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('card.pillVideo')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5" /> {t('card.pillNoVideo')}
                </span>
              )}
              {subCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  <Subtitles className="w-3.5 h-3.5" /> {t('card.pillSubtitles', { count: subCount })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-5">
          {!gt.supports_tutorial_video ? (
            <div className="text-slate-500 text-sm italic">{t('card.tutorialDisabled')}</div>
          ) : (
            <>
              {/* Legacy tutorial video */}
              <section>
                <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  {t('card.legacyVideoHeading')}
                  {adminHasVideo && (
                    <span className="text-slate-400 font-normal">{t('card.videoVersion', { version: gt.tutorial_video_version })}</span>
                  )}
                </div>
                {adminHasVideo ? (
                  <div className="space-y-2">
                    <MediaVideo
                      code={gt.code}
                      variant="admin"
                      version={gt.tutorial_video_version}
                      filename={gt.tutorial_video_path!}
                      subtitles={gt.tutorial_subtitles}
                      token={token}
                    />
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 mr-auto truncate">{gt.tutorial_video_path}</span>
                        <FileDrop
                          accept={VIDEO_ACCEPT}
                          onFile={(f) => props.onAdminUploadVideo(gt.code, f)}
                          title={t('card.maxVideoSize', { size: MAX_VIDEO_MB })}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800"
                        >
                          <Upload className="w-4 h-4" /> {t('actions.replace')}
                        </FileDrop>
                        <button
                          onClick={() => props.onAdminRemoveVideo(gt.code)}
                          className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" /> {t('actions.remove')}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">{t('card.legacyVideoClientNote')}</p>
                    )}
                  </div>
                ) : isAdmin ? (
                  <FileDrop
                    accept={VIDEO_ACCEPT}
                    onFile={(f) => props.onAdminUploadVideo(gt.code, f)}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
                  >
                    <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    <div className="font-medium">{t('card.dropVideoHint')}</div>
                    <div className="text-xs text-slate-400 mt-1">{t('card.noLegacyVideo')}</div>
                    <div className="text-xs text-slate-400 mt-1">{t('card.maxVideoSize', { size: MAX_VIDEO_MB })}</div>
                  </FileDrop>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{t('card.noLegacyVideoClient')}</span>
                  </div>
                )}
              </section>

              {/* Client override video */}
              {!isAdmin && (
                <section>
                  <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Film className="w-4 h-4" />
                    {t('card.yourOverrideHeading')}
                    {clientHasOverride && (
                      <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{t('card.activeOverride')}</span>
                    )}
                  </div>
                  {clientHasOverride ? (
                    <div className="space-y-2">
                      <MediaVideo
                        code={gt.code}
                        variant="client"
                        version={override!.tutorial_video_version}
                        filename={override!.tutorial_video_path!}
                        subtitles={override!.tutorial_subtitles || {}}
                        token={token}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 mr-auto truncate">
                          {override!.tutorial_video_path} {t('card.videoVersion', { version: override!.tutorial_video_version })}
                        </span>
                        <FileDrop
                          accept={VIDEO_ACCEPT}
                          onFile={(f) => props.onClientUploadVideo(gt.code, f)}
                          title={t('card.maxVideoSize', { size: MAX_VIDEO_MB })}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800"
                        >
                          <Upload className="w-4 h-4" /> {t('actions.replace')}
                        </FileDrop>
                        <button
                          onClick={() => props.onClientRemoveVideo(gt.code)}
                          className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" /> {t('actions.remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <FileDrop
                      accept={VIDEO_ACCEPT}
                      onFile={(f) => props.onClientUploadVideo(gt.code, f)}
                      className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
                    >
                      <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                      <div className="font-medium">{t('card.dropVideoHint')}</div>
                      <div className="text-xs text-slate-400 mt-1">{t('card.usingLegacyVideo')}</div>
                      <div className="text-xs text-slate-400 mt-1">{t('card.maxVideoSize', { size: MAX_VIDEO_MB })}</div>
                    </FileDrop>
                  )}
                </section>
              )}

              {/* Collapsible subtitle tracks */}
              <section className="border border-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSubsOpen((o) => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${subsOpen ? '' : '-rotate-90'}`} />
                  <Subtitles className="w-4 h-4" />
                  {isAdmin ? t('card.subtitleTracksLegacy') : t('card.subtitleTracksOverride')}
                  <span className="ml-auto text-xs font-normal text-slate-500">
                    {t('card.pillSubtitles', { count: subCount })}
                  </span>
                </button>
                {subsOpen && (
                  <div className="px-3 pb-3 space-y-1 text-sm border-t border-slate-100 pt-2">
                    {SUPPORTED_LANGS.map((lang) => {
                      const hasSubtitle = !!editableSubs[lang];
                      return (
                        <div key={lang} className="flex items-center gap-3 py-1.5 px-2 hover:bg-slate-50 rounded">
                          <span className="w-32 text-slate-700">
                            {LANG_NAMES[lang]} <span className="text-xs text-slate-400">{t('card.langCode', { lang })}</span>
                          </span>
                          {hasSubtitle ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              <span className="text-slate-600 truncate">{editableSubs[lang]}</span>
                              <FileDrop
                                accept=".vtt,text/vtt"
                                onFile={(f) => isAdmin ? props.onAdminUploadSubtitle(gt.code, lang, f) : props.onClientUploadSubtitle(gt.code, lang, f)}
                                className="ml-auto text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                              >
                                {t('actions.replace')}
                              </FileDrop>
                              <button
                                onClick={() => isAdmin ? props.onAdminRemoveSubtitle(gt.code, lang) : props.onClientRemoveSubtitle(gt.code, lang)}
                                className="text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded hover:bg-rose-200"
                              >
                                {t('actions.remove')}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-400">{t('card.missing')}</span>
                              <FileDrop
                                accept=".vtt,text/vtt"
                                onFile={(f) => isAdmin ? props.onAdminUploadSubtitle(gt.code, lang, f) : props.onClientUploadSubtitle(gt.code, lang, f)}
                                className="ml-auto text-xs px-2 py-1 bg-slate-700 text-white rounded hover:bg-slate-800"
                              >
                                {t('actions.uploadVtt')}
                              </FileDrop>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
