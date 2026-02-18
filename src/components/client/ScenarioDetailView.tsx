import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Upload, Play, ChevronLeft, ChevronRight, Film, FileArchive, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { secureAuth } from '../../lib/secureAuth';

const API_BASE_URL = '/backend/api';

interface ScenarioDetail {
  id: string;
  title: string;
  description: string;
  uniqid: string;
  game_type?: string;
  scenario_type?: string;
  version?: string;
  game_visual: string | null;
  images: string[];
  video_url: string | null;
  has_zip_files: boolean;
  files_count: number;
}

interface ScenarioDetailViewProps {
  uniqid: string;
  onBack: () => void;
}

export function ScenarioDetailView({ uniqid, onBack }: ScenarioDetailViewProps) {
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [videoUploadSuccess, setVideoUploadSuccess] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchScenarioDetail();
  }, [uniqid]);

  const getAuthHeaders = (): Record<string, string> => {
    const token = secureAuth.getStoredToken();
    return token ? { 'X-Auth-Token': token } : {};
  };

  const fetchScenarioDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/scenario_files.php?action=get_scenario&uniqid=${encodeURIComponent(uniqid)}`,
        { credentials: 'include', headers: getAuthHeaders() }
      );
      const result = await response.json();
      if (result.success && result.data) {
        setScenario(result.data);
      } else {
        setError(result.error || 'Failed to load scenario');
      }
    } catch {
      setError('Network error — could not load scenario details');
    } finally {
      setLoading(false);
    }
  };

  const allImages = scenario
    ? [
        ...(scenario.game_visual ? [scenario.game_visual] : []),
        ...scenario.images.filter((img) => img !== scenario.game_visual),
      ]
    : [];

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scenario) return;

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
        setScenario((prev) => prev ? { ...prev, video_url: result.video_url } : prev);
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
    if (!scenario) return;
    setDownloadingZip(true);
    setDownloadError(null);

    try {
      const token = secureAuth.getStoredToken();
      const url = `${API_BASE_URL}/scenario_files.php?action=download_zip&uniqid=${encodeURIComponent(scenario.uniqid)}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: token ? { 'X-Auth-Token': token } : {},
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scenarios
        </button>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mb-6 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span className="text-sm font-medium">Back to Scenarios</span>
      </button>

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

            {scenario.video_url ? (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
                  <video src={scenario.video_url} controls className="w-full h-full" />
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
                    ? `${scenario.files_count} file${scenario.files_count !== 1 ? 's' : ''} available as ZIP`
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
