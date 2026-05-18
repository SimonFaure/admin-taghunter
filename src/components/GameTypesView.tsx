import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2, Film, Subtitles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { SUPPORTED_LANGS, type Lang } from '../scenarios/i18n/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

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

export function GameTypesView() {
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
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [headersJson]);

  useEffect(() => { load(); }, [load]);

  const handleAdminUploadVideo = async (code: string, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('video', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_upload_video`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || 'Upload failed'); return; }
    await load();
  };

  const handleAdminRemoveVideo = async (code: string) => {
    if (!confirm(`Remove the legacy tutorial video for ${code}? Clients without an override will have no tutorial video until you upload a new one.`)) return;
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_remove_video`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code }),
    });
    if (!res.ok) { setError((await res.json()).error || 'Remove failed'); return; }
    await load();
  };

  const handleAdminUploadSubtitle = async (code: string, lang: Lang, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('lang', lang);
    fd.append('subtitle', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_upload_subtitle`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || 'Upload failed'); return; }
    await load();
  };

  const handleAdminRemoveSubtitle = async (code: string, lang: Lang) => {
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_remove_subtitle`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code, lang }),
    });
    if (!res.ok) { setError((await res.json()).error || 'Remove failed'); return; }
    await load();
  };

  const handleAdminUpdateSupports = async (code: string, field: 'supports_tutorial_video' | 'supports_intro_video', value: boolean) => {
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=admin_update_supports`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code, [field]: value }),
    });
    if (!res.ok) { setError((await res.json()).error || 'Update failed'); return; }
    await load();
  };

  const handleClientUploadVideo = async (code: string, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('video', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_upload_video`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || 'Upload failed'); return; }
    await load();
  };

  const handleClientRemoveVideo = async (code: string) => {
    if (!confirm(`Remove your tutorial video override for ${code}? You'll fall back to the legacy video from Taghunter.`)) return;
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_remove_video`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code }),
    });
    if (!res.ok) { setError((await res.json()).error || 'Remove failed'); return; }
    await load();
  };

  const handleClientUploadSubtitle = async (code: string, lang: Lang, file: File) => {
    const fd = new FormData();
    fd.append('code', code);
    fd.append('lang', lang);
    fd.append('subtitle', file);
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_upload_subtitle`, { method: 'POST', headers: headersMultipart, body: fd });
    if (!res.ok) { setError((await res.json()).error || 'Upload failed'); return; }
    await load();
  };

  const handleClientRemoveSubtitle = async (code: string, lang: Lang) => {
    const res = await fetch(`${API_BASE_URL}/game_types.php?action=client_remove_subtitle`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ code, lang }),
    });
    if (!res.ok) { setError((await res.json()).error || 'Remove failed'); return; }
    await load();
  };

  if (loading) return <div className="p-8 text-slate-500">Loading game types…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Game Types</h2>
        <p className="text-slate-600 mt-1">
          {isAdmin
            ? 'Manage the legacy tutorial video and subtitle tracks shipped to every client. Clients can override the video for their own events but cannot delete the legacy one.'
            : 'Upload your own tutorial video to replace the Taghunter legacy version for your events. Subtitle tracks let you localize the on-screen text.'}
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">Dismiss</button>
        </div>
      )}

      <div className="space-y-4">
        {gameTypes.map((gt) => (
          <GameTypeCard
            key={gt.code}
            gameType={gt}
            override={overrides[gt.code] || null}
            isAdmin={isAdmin}
            onAdminUploadVideo={handleAdminUploadVideo}
            onAdminRemoveVideo={handleAdminRemoveVideo}
            onAdminUploadSubtitle={handleAdminUploadSubtitle}
            onAdminRemoveSubtitle={handleAdminRemoveSubtitle}
            onAdminUpdateSupports={handleAdminUpdateSupports}
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
  onAdminUploadVideo: (code: string, file: File) => void;
  onAdminRemoveVideo: (code: string) => void;
  onAdminUploadSubtitle: (code: string, lang: Lang, file: File) => void;
  onAdminRemoveSubtitle: (code: string, lang: Lang) => void;
  onAdminUpdateSupports: (code: string, field: 'supports_tutorial_video' | 'supports_intro_video', value: boolean) => void;
  onClientUploadVideo: (code: string, file: File) => void;
  onClientRemoveVideo: (code: string) => void;
  onClientUploadSubtitle: (code: string, lang: Lang, file: File) => void;
  onClientRemoveSubtitle: (code: string, lang: Lang) => void;
}

function GameTypeCard(props: CardProps) {
  const { gameType: gt, override, isAdmin } = props;
  const videoInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const adminHasVideo = !!gt.tutorial_video_path;
  const clientHasOverride = !!override?.tutorial_video_path;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{gt.name}</h3>
          <code className="text-xs text-slate-500">code: {gt.code}</code>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gt.supports_tutorial_video}
                onChange={(e) => props.onAdminUpdateSupports(gt.code, 'supports_tutorial_video', e.target.checked)}
              />
              Tutorial video
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gt.supports_intro_video}
                onChange={(e) => props.onAdminUpdateSupports(gt.code, 'supports_intro_video', e.target.checked)}
              />
              Intro video
            </label>
          </div>
        )}
      </div>

      {!gt.supports_tutorial_video && (
        <div className="text-slate-500 text-sm italic">Tutorial video disabled for this game type.</div>
      )}

      {gt.supports_tutorial_video && (
        <>
          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Film className="w-4 h-4" />
              Legacy tutorial video (Taghunter)
            </div>
            {adminHasVideo ? (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm text-slate-700">
                  {gt.tutorial_video_path} <span className="text-slate-500">(v{gt.tutorial_video_version})</span>
                </span>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="ml-auto px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 flex items-center gap-1"
                    >
                      <Upload className="w-4 h-4" /> Replace
                    </button>
                    <button
                      onClick={() => props.onAdminRemoveVideo(gt.code)}
                      className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700 flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                <AlertCircle className="w-5 h-5" />
                <span>No legacy tutorial video uploaded yet.</span>
                {isAdmin && (
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="ml-auto px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Upload className="w-4 h-4" /> Upload
                  </button>
                )}
              </div>
            )}
            {isAdmin && (
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) props.onAdminUploadVideo(gt.code, f);
                  if (e.target) e.target.value = '';
                }}
              />
            )}
          </div>

          {!isAdmin && (
            <div className="mb-4">
              <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Film className="w-4 h-4" />
                Your tutorial video override
              </div>
              {clientHasOverride ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm text-slate-700">
                    {override!.tutorial_video_path} <span className="text-slate-500">(v{override!.tutorial_video_version})</span>
                  </span>
                  <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Active override</span>
                  <button
                    onClick={() => subtitleInputsRef.current[`override-video`]?.click()}
                    className="ml-auto px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Upload className="w-4 h-4" /> Replace
                  </button>
                  <button
                    onClick={() => props.onClientRemoveVideo(gt.code)}
                    className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  <span>Using legacy video. Upload your own to override:</span>
                  <button
                    onClick={() => subtitleInputsRef.current[`override-video`]?.click()}
                    className="ml-auto px-3 py-1.5 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Upload className="w-4 h-4" /> Upload override
                  </button>
                </div>
              )}
              <input
                ref={(el) => { subtitleInputsRef.current[`override-video`] = el; }}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) props.onClientUploadVideo(gt.code, f);
                  if (e.target) e.target.value = '';
                }}
              />
            </div>
          )}

          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Subtitles className="w-4 h-4" />
              Subtitle tracks {isAdmin ? '(legacy)' : '(override)'}
            </div>
            <div className="space-y-1 text-sm">
              {SUPPORTED_LANGS.map((lang) => {
                const subtitleSource = isAdmin ? gt.tutorial_subtitles : (override?.tutorial_subtitles || {});
                const hasSubtitle = !!subtitleSource?.[lang];
                const inputKey = `subtitle-${lang}`;
                return (
                  <div key={lang} className="flex items-center gap-3 py-1.5 px-2 hover:bg-slate-50 rounded">
                    <span className="w-32 text-slate-700">
                      {LANG_NAMES[lang]} <span className="text-xs text-slate-400">({lang})</span>
                    </span>
                    {hasSubtitle ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-slate-600">{subtitleSource[lang]}</span>
                        <button
                          onClick={() => subtitleInputsRef.current[inputKey]?.click()}
                          className="ml-auto text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                        >
                          Replace
                        </button>
                        <button
                          onClick={() => isAdmin ? props.onAdminRemoveSubtitle(gt.code, lang) : props.onClientRemoveSubtitle(gt.code, lang)}
                          className="text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded hover:bg-rose-200"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-400">— missing</span>
                        <button
                          onClick={() => subtitleInputsRef.current[inputKey]?.click()}
                          className="ml-auto text-xs px-2 py-1 bg-slate-700 text-white rounded hover:bg-slate-800"
                        >
                          Upload .vtt
                        </button>
                      </>
                    )}
                    <input
                      ref={(el) => { subtitleInputsRef.current[inputKey] = el; }}
                      type="file"
                      accept=".vtt,text/vtt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          isAdmin
                            ? props.onAdminUploadSubtitle(gt.code, lang, f)
                            : props.onClientUploadSubtitle(gt.code, lang, f);
                        }
                        if (e.target) e.target.value = '';
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
