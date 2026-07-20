import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Upload, Play, ChevronLeft, ChevronRight, Film, FileArchive, FileText, Loader2, AlertCircle, CheckCircle, Pencil, Maximize2, X, Smartphone } from 'lucide-react';
import { secureAuth } from '../../lib/secureAuth';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { getGameVisualUrl } from './MyScenariosView';
import { GameTypeIcon } from '../icons/GameTypeIcons';
import { getDifficultyLabel, getDifficultyBadgeClass } from '../../types/difficulty';
import { getAudienceLabel } from '../../types/audience';
import type { ClientScenario } from './types';
import { GoPreviewContent, type GoPreviewEnigma } from '../../scenarios/preview/GoPreviewContent';

interface GoPreviewData {
  title: string;
  answer_count: 2 | 4;
  enigmas: GoPreviewEnigma[];
  warning: string | null;
}

interface ScenarioFile {
  id: number;
  name: string;
  file_size: number;
  mime_type: string;
  filename: string;
  created_at?: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

function parseMedias(medias: string | Record<string, unknown> | null | undefined) {
  if (!medias) return {};
  try {
    return typeof medias === 'string' ? JSON.parse(medias) : medias;
  } catch {
    return {};
  }
}

function getVideoUrl(medias: string | Record<string, unknown> | null | undefined, uniqid?: string): string | null {
  const parsed = parseMedias(medias) as { video?: string };
  if (!parsed.video) return null;
  const v = parsed.video;
  if (v.startsWith('http')) return v;
  if (v.startsWith('/')) return `${MEDIA_BASE_URL}${v}`;
  return uniqid ? `${MEDIA_BASE_URL}/media/${uniqid}/${v}` : `${MEDIA_BASE_URL}/${v}`;
}

function resolveMediaUrl(url: string, uniqid?: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${MEDIA_BASE_URL}${url}`;
  return uniqid ? `${MEDIA_BASE_URL}/media/${uniqid}/${url}` : `${MEDIA_BASE_URL}/${url}`;
}

function getExtraImages(medias: string | Record<string, unknown> | null | undefined, uniqid?: string): string[] {
  const parsed = parseMedias(medias) as { images?: Record<string, string> };
  if (!parsed.images) return [];
  return Object.entries(parsed.images)
    .filter(([key]) => key !== 'game_visual')
    .map(([, url]) => resolveMediaUrl(url, uniqid));
}

// Just the background image (one of the `images` map entries), resolved to a
// URL. Used by the "GO client only" portal, which shows only the game visual +
// background image (no other media). See memory project_go_client_only.
function getBackgroundImageUrl(
  medias: string | Record<string, unknown> | null | undefined,
  uniqid?: string
): string | null {
  const parsed = parseMedias(medias) as { images?: Record<string, string> };
  const bg = parsed.images?.background_image;
  return bg ? resolveMediaUrl(bg, uniqid) : null;
}

export function ScenarioDetailView() {
  const { t } = useTranslation('scenarioDetail');
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const onBack = () => navigate('/my/scenarios');

  // TODO: replace with a single-row endpoint (e.g. client_scenarios.php?action=get&uniqid=)
  // when one is available. For now we fetch the full list and find the matching row.
  const [scenario, setScenario] = useState<ClientScenario | null>(null);
  const [loadingScenario, setLoadingScenario] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Extra details (difficulty / audience / per-file list) come from the
  // single-row get_scenario endpoint, which reads game_meta + scenario_files.
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [files, setFiles] = useState<ScenarioFile[]>([]);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingScenario(true);
      setLoadError(null);
      try {
        const res = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=list`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body?.error || t('failedToLoad'));
        } else {
          const list = (body?.data as ClientScenario[]) || [];
          const found = list.find((s) => s.uniqid === uniqid) || null;
          if (!found) setLoadError(t('scenarioNotFound'));
          setScenario(found);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t('networkError'));
      } finally {
        if (!cancelled) setLoadingScenario(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid]);

  useEffect(() => {
    if (!uniqid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/scenario_files.php?action=get_scenario&uniqid=${encodeURIComponent(uniqid)}`
        );
        const body = await res.json();
        if (cancelled || !res.ok || !body?.data) return;
        setDifficulty(body.data.difficulty || null);
        setAudience(body.data.audience || null);
        setFiles(Array.isArray(body.data.files) ? body.data.files : []);
      } catch {
        // Non-fatal: the core scenario view still renders without these extras.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid]);

  // Tag Hunter GO preview - the answer-key sheet. We just try to fetch it: the
  // go.php?action=preview endpoint gates on the client having GO enabled + a GO
  // grant for this scenario, so a refusal simply means "don't show it".
  const [goPreview, setGoPreview] = useState<GoPreviewData | null>(null);
  const [goPreviewOpen, setGoPreviewOpen] = useState(false);

  useEffect(() => {
    if (!uniqid) return;
    let cancelled = false;
    setGoPreview(null);
    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/go.php?action=preview&uniqid=${encodeURIComponent(uniqid)}`,
          { credentials: 'include' },
        );
        if (cancelled || !res.ok) return;
        const body = await res.json();
        if (cancelled || !body?.data) return;
        const d = body.data as {
          title: string;
          answer_count: number;
          warning: string | null;
          enigmas: Array<{
            number: string;
            short_code: string;
            answers: Array<{ letter: string; correct: boolean; image_url: string | null }>;
          }>;
        };
        setGoPreview({
          title: d.title,
          answer_count: d.answer_count === 4 ? 4 : 2,
          warning: d.warning,
          enigmas: d.enigmas.map((e) => ({
            number: e.number,
            short_code: e.short_code,
            answers: e.answers.map((a) => ({ letter: a.letter, correct: a.correct, imageUrl: a.image_url })),
          })),
        });
      } catch {
        // Non-fatal: GO preview is simply not offered.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid]);

  // Only the scenario's owner may open it in the Studio editor. Clients can edit
  // their own custom scenarios but NOT product scenarios (those are admin-owned
  // and granted read-only); admins may edit anything.
  const isAdmin = user?.user_type === 'admin';
  const isOwnCustom =
    scenario?.scenario_type !== 'product' &&
    scenario?.client_id != null &&
    String(scenario.client_id) === String(user?.client_id);
  const canEdit = isAdmin || isOwnCustom;

  // GO-only portal (GO/Drop without Playground): show only the game visual +
  // background image (no other scenario media). Derived per-app
  // (project_client_app_section).
  const goClientOnly = getAppAccess(user).scenariosGoOnly;
  const gameVisual = getGameVisualUrl(scenario?.medias, scenario?.uniqid);
  const extraImages = goClientOnly
    ? (getBackgroundImageUrl(scenario?.medias, scenario?.uniqid) ? [getBackgroundImageUrl(scenario?.medias, scenario?.uniqid)!] : [])
    : getExtraImages(scenario?.medias, scenario?.uniqid);
  const allImages = [...(gameVisual ? [gameVisual] : []), ...extraImages];

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [videoUploadSuccess, setVideoUploadSuccess] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVideoUrl(getVideoUrl(scenario?.medias, scenario?.uniqid));
    setActiveImageIndex(0);
  }, [scenario]);

  const getAuthHeaders = (): Record<string, string> => {
    const token = secureAuth.getStoredToken();
    return token ? { 'X-Auth-Token': token } : {};
  };

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoUploading(true);
    setVideoUploadError(null);
    setVideoUploadSuccess(false);

    const formData = new FormData();
    if (!scenario) return;
    formData.append('video', file);
    formData.append('uniqid', scenario.uniqid);

    try {
      const token = secureAuth.getStoredToken();
      const response = await fetch(`${API_BASE_URL}/scenario_files.php?action=upload_video`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'X-Auth-Token': token } : {},
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        setVideoUploadSuccess(true);
        setVideoUrl(result.video_url);
        setTimeout(() => setVideoUploadSuccess(false), 3000);
      } else {
        setVideoUploadError(result.error || t('failedToUploadVideo'));
      }
    } catch {
      setVideoUploadError(t('networkErrorUpload'));
    } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleDownloadZip = async () => {
    if (!scenario) return;
    setDownloadingZip(true);
    setDownloadError(null);

    try {
      const url = `${API_BASE_URL}/scenario_files.php?action=download_zip&uniqid=${encodeURIComponent(scenario.uniqid)}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const err = await response.json();
        setDownloadError(err.error || t('downloadFailed'));
        return;
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `scenario_${scenario.uniqid}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      setDownloadError(t('networkErrorDownload'));
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleDownloadFile = async (file: ScenarioFile) => {
    setDownloadingFileId(file.id);
    setDownloadError(null);
    try {
      const url = `${API_BASE_URL}/scenario_files.php?action=download_file&id=${encodeURIComponent(file.id)}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setDownloadError(err.error || t('downloadFailed'));
        return;
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.name || file.filename || `file_${file.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      setDownloadError(t('networkErrorDownload'));
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (loadingScenario) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError || !scenario) {
    return (
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">{t('backToScenarios')}</span>
        </button>
        <div className="bg-red-50 p-6 rounded-xl border border-red-200">
          <p className="text-red-600">{loadError || t('scenarioNotFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">{t('backToScenarios')}</span>
        </button>
        {scenario.uniqid && canEdit && (
          <button
            onClick={() => navigate(`/studio/scenarios/${scenario.uniqid}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
          >
            <Pencil className="w-4 h-4" />
            {t('editInStudio')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          {allImages.length > 0 ? (
            <div className="relative bg-slate-900 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <img
                src={allImages[activeImageIndex]}
                alt={scenario.title}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setLightboxOpen(true)}
                title={t('expand')}
                className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImageIndex(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === activeImageIndex ? 'bg-white' : 'bg-white/40'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center"
              style={{ aspectRatio: '16/9' }}
            >
              <Film className="w-16 h-16 text-slate-300" />
            </div>
          )}

          {allImages.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImageIndex(i)}
                  className={`rounded-lg overflow-hidden aspect-square border-2 transition-all ${
                    i === activeImageIndex ? 'border-slate-900' : 'border-transparent hover:border-slate-300'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-start gap-3 mb-2 flex-wrap">
              {scenario.game_type && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full capitalize tracking-wide">
                  <GameTypeIcon type={scenario.game_type} className="w-3.5 h-3.5" />
                  {scenario.game_type}
                </span>
              )}
              {scenario.scenario_type && (
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full capitalize tracking-wide">
                  {scenario.scenario_type}
                </span>
              )}
              {scenario.version && (
                <span className="px-3 py-1 bg-slate-50 text-slate-400 text-xs rounded-full">
                  v{scenario.version}
                </span>
              )}
              {difficulty && (
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full capitalize tracking-wide ${getDifficultyBadgeClass(
                    difficulty
                  )}`}
                >
                  {getDifficultyLabel(difficulty, t)}
                </span>
              )}
              {audience && (
                <span className="px-3 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full capitalize tracking-wide">
                  {getAudienceLabel(audience, t)}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">{scenario.title}</h1>
            <p className="text-slate-600 leading-relaxed">{scenario.description}</p>
          </div>

          {goPreview && (
            <>
              <div className="h-px bg-slate-100" />
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  {t('goSection')}
                </h3>
                <p className="text-xs text-slate-400 mb-3">{t('goPreviewHint')}</p>
                <button
                  onClick={() => setGoPreviewOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  <Smartphone className="w-4 h-4" />
                  {t('goPreviewOpen')}
                </button>
              </div>
            </>
          )}

          <div className="h-px bg-slate-100" />

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Play className="w-4 h-4" />
              {t('scenarioVideo')}
            </h3>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
                  <video src={videoUrl} controls className="w-full h-full" />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  {t('replaceVideo')}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    className="hidden"
                    onChange={handleVideoUpload}
                    disabled={videoUploading}
                  />
                </label>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                <Film className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-3">{t('noVideoYet')}</p>
                <label
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${
                    videoUploading
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-slate-700'
                  }`}
                >
                  {videoUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('uploading')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {t('addVideo')}
                    </>
                  )}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    className="hidden"
                    onChange={handleVideoUpload}
                    disabled={videoUploading}
                  />
                </label>
                <p className="text-xs text-slate-400 mt-2">{t('videoFormatsHint')}</p>
              </div>
            )}

            {videoUploadError && (
              <div className="flex items-center gap-2 p-3 mt-3 bg-red-50 rounded-lg text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {videoUploadError}
              </div>
            )}
            {videoUploadSuccess && (
              <div className="flex items-center gap-2 p-3 mt-3 bg-green-50 rounded-lg text-sm text-green-600">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {t('videoUploadedSuccess')}
              </div>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileArchive className="w-4 h-4" />
                  {t('downloadableFiles')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {files.length > 0
                    ? t('filesAvailable', { count: files.length })
                    : t('noFilesAvailable')}
                </p>
              </div>

              {files.length > 1 && (
                <button
                  onClick={handleDownloadZip}
                  disabled={downloadingZip}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    downloadingZip
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-slate-700 active:scale-95'
                  }`}
                >
                  {downloadingZip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('preparing')}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t('downloadAllZip')}
                    </>
                  )}
                </button>
              )}
            </div>

            {files.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {files.map((file) => {
                  const busy = downloadingFileId === file.id;
                  return (
                    <li
                      key={file.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-slate-100 rounded-lg flex-shrink-0">
                          <FileText className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                          <p className="text-xs text-slate-400">{formatFileSize(file.file_size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadFile(file)}
                        disabled={busy}
                        title={t('download')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
                          busy
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {t('download')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {downloadError && (
              <div className="flex items-center gap-2 p-3 mt-3 bg-red-50 rounded-lg text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {downloadError}
              </div>
            )}
          </div>
        </div>
      </div>

      {goPreview && goPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">{t('goPreviewOpen')}</h2>
              <button onClick={() => setGoPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              <GoPreviewContent
                title={typeof goPreview.title === 'string' ? goPreview.title : scenario.title}
                answerCount={goPreview.answer_count === 4 ? 4 : 2}
                enigmas={goPreview.enigmas}
                warning={goPreview.warning}
              />
            </div>
          </div>
        </div>
      )}

      {lightboxOpen && allImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            title={t('close')}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={allImages[activeImageIndex]}
            alt={scenario.title}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {allImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex(i);
                    }}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i === activeImageIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
