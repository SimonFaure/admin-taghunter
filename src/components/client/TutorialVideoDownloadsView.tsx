import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Download, Film, Subtitles } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { LANGUAGES } from '../../i18n/languages';
import type { Lang } from '../../scenarios/i18n/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Download-only companion to GameTypesView. Lists the Tag Hunter DEFAULT
// tutorial video of every game type the client has access to (client overrides
// are managed on /my/game-types and deliberately not listed here), so a client
// can grab the mp4 + subtitle files for briefings, their own site, a projector,
// etc. The server filters disabled game types out of `action=list`, so whatever
// comes back is what this client is entitled to.
interface GameType {
  code: string;
  name: string;
  supports_tutorial_video: boolean;
  tutorial_video_path: string | null;
  tutorial_video_version: number;
  tutorial_subtitles: Record<string, string>;
}

// `get_media` authenticates off a header OR a `token` query param - the query
// form is what lets a plain <video>/<a href> reach it. `download=1` flips the
// response to Content-Disposition: attachment.
function buildMediaUrl(p: {
  code: string;
  version: number;
  filename?: string;
  subtitleLang?: string;
  download?: boolean;
  token: string | null;
}): string {
  const u = new URLSearchParams();
  u.set('action', 'get_media');
  u.set('code', p.code);
  u.set('variant', 'admin');
  u.set('version', String(p.version));
  if (p.filename) u.set('filename', p.filename);
  if (p.subtitleLang) u.set('subtitle_lang', p.subtitleLang);
  if (p.download) u.set('download', '1');
  if (p.token) u.set('token', p.token);
  return `${API_BASE_URL}/game_types.php?${u.toString()}`;
}

function langLabel(code: string): string {
  return LANGUAGES[code as Lang]?.nativeName ?? code;
}

function VideoRow({ gt, token }: { gt: GameType; token: string | null }) {
  const { t } = useTranslation('tutorialDownloads');
  const version = gt.tutorial_video_version;
  const filename = gt.tutorial_video_path as string;
  const subtitleLangs = Object.keys(gt.tutorial_subtitles || {}).sort();
  const videoSrc = buildMediaUrl({ code: gt.code, version, filename, token });
  const ext = (filename.split('.').pop() || 'mp4').toLowerCase();

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="grid md:grid-cols-[18rem_1fr] gap-0">
        {/* preload="metadata" so a page with ten game types doesn't pull ten
            full videos - the operator can still scrub to identify one. */}
        <video
          src={videoSrc}
          controls
          preload="metadata"
          className="w-full aspect-video bg-black md:h-full object-contain"
        />
        <div className="p-5 flex flex-col gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{gt.name}</h3>
            <p className="text-sm text-slate-500">
              {t('row.meta', { version, ext: ext.toUpperCase() })}
            </p>
          </div>

          <div>
            <a
              href={buildMediaUrl({ code: gt.code, version, filename, download: true, token })}
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('row.downloadVideo')}
            </a>
          </div>

          {subtitleLangs.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <Subtitles className="w-4 h-4 text-slate-400" />
                <span>{t('row.subtitles')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {subtitleLangs.map((lang) => (
                  <a
                    key={lang}
                    href={buildMediaUrl({
                      code: gt.code,
                      version,
                      subtitleLang: lang,
                      download: true,
                      token,
                    })}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded-lg text-sm text-slate-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {langLabel(lang)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TutorialVideoDownloadsView() {
  const { t } = useTranslation('tutorialDownloads');
  const { token } = useAuth();
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/game_types.php?action=list`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const types = ((json.game_types || []) as GameType[]).filter(
        (gt) => gt.supports_tutorial_video && !!gt.tutorial_video_path
      );
      types.forEach((gt) => {
        if (!gt.tutorial_subtitles || Array.isArray(gt.tutorial_subtitles)) {
          gt.tutorial_subtitles = {};
        }
      });
      setGameTypes(types);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [headers, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-8 text-slate-500">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('title')}</h2>
        <p className="text-slate-600 mt-1">{t('description')}</p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">
            {t('dismiss')}
          </button>
        </div>
      )}

      {gameTypes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Film className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {gameTypes.map((gt) => (
            <VideoRow key={gt.code} gt={gt} token={token} />
          ))}
        </div>
      )}
    </div>
  );
}
