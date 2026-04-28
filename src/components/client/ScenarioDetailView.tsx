import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Upload, Play, ChevronLeft, ChevronRight, Film, FileArchive, Loader2, AlertCircle, CheckCircle, Pencil } from 'lucide-react';
import { secureAuth } from '../../lib/secureAuth';
import { getGameVisualUrl } from './MyScenariosView';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

interface ScenarioDetailViewProps {
  scenario: ClientScenario;
  onBack: () => void;
}

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

function getExtraImages(medias: string | Record<string, unknown> | null | undefined, uniqid?: string): string[] {
  const parsed = parseMedias(medias) as { images?: Record<string, string> };
  if (!parsed.images) return [];
  return Object.entries(parsed.images)
    .filter(([key]) => key !== 'game_visual')
    .map(([, url]) => {
      if (url.startsWith('http')) return url;
      if (url.startsWith('/')) return `${MEDIA_BASE_URL}${url}`;
      return uniqid ? `${MEDIA_BASE_URL}/media/${uniqid}/${url}` : `${MEDIA_BASE_URL}/${url}`;
    });
}

export function ScenarioDetailView({ scenario, onBack }: ScenarioDetailViewProps) {
  const gameVisual = getGameVisualUrl(scenario.medias, scenario.uniqid);
  const extraImages = getExtraImages(scenario.medias, scenario.uniqid);
  const allImages = [...(gameVisual ? [gameVisual] : []), ...extraImages];

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(getVideoUrl(scenario.medias, scenario.uniqid));
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [videoUploadSuccess, setVideoUploadSuccess] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
        setVideoUploadError(result.error || 'Failed to upload video');
      }
    } catch {
      setVideoUploadError('Network error during upload');
    } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleDownloadZip = async () => {
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
        setDownloadError(err.error || 'Download failed');
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
      setDownloadError('Network error during download');
    } finally {
      setDownloadingZip(false);
    }
  };

  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">Back to Scenarios</span>
        </button>
        {scenario.uniqid && (
          <button
            onClick={() => navigate(`/studio/scenarios/${scenario.uniqid}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
          >
            <Pencil className="w-4 h-4" />
            Edit in Studio
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
                <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full capitalize tracking-wide">
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
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">{scenario.title}</h1>
            <p className="text-slate-600 leading-relaxed">{scenario.description}</p>
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Play className="w-4 h-4" />
              Scenario Video
            </h3>

            {videoUrl ? (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
                  <video src={videoUrl} controls className="w-full h-full" />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Replace video
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
                <p className="text-sm text-slate-500 mb-3">No video added yet</p>
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
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Add a video
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
                <p className="text-xs text-slate-400 mt-2">MP4, WebM, MOV — max 200MB</p>
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
                Video uploaded successfully
              </div>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileArchive className="w-4 h-4" />
                  Downloadable Files
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {scenario.has_zip_files
                    ? `${scenario.files_count ?? ''} file${scenario.files_count !== 1 ? 's' : ''} available as ZIP`
                    : 'No files available yet'}
                </p>
              </div>

              {scenario.has_zip_files && (
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
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download ZIP
                    </>
                  )}
                </button>
              )}
            </div>

            {downloadError && (
              <div className="flex items-center gap-2 p-3 mt-3 bg-red-50 rounded-lg text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {downloadError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
