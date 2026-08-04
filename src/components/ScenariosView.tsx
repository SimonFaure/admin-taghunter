import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, User, Calendar, Trash2, Eye, Pencil, Image as ImageIcon, FileJson, Globe, Tag, Upload, File, FileImage, FileVideo, FileAudio, FileText, FileCode, ChevronDown, FileArchive, Plus, Download, Gauge } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { ImportLegacyZipModal } from './ImportLegacyZipModal';
import { ManageGameTypesModal } from './ManageGameTypesModal';
import { ScenarioListControls } from './scenarios/ScenarioListControls';
import { AUDIENCE_BANDS, type AudienceBand, getBandLabel, resolveBands } from '../types/audience';
import { DIFFICULTY_LEVELS, coerceDifficulty, formatDifficultyStars, getDifficultyBadgeClass } from '../types/difficulty';
import { normalizeUnivers } from '../types/univers';
import { listRegisteredAdapters } from '../scenarios';
import { GameTypeIcon } from './icons/GameTypeIcons';
import { HelpButton } from '../help';
// Side-effect import: registers every shipped adapter so the game-type filter
// chips below can be derived from the registry even when the editor route
// hasn't been visited yet.
import '../scenarios/bootstrap';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

interface Scenario {
  id: number;
  title: string;
  description: string;
  game_type: string;
  scenario_type: string | null;
  client_id: number | null;
  client_name: string | null;
  client_email: string | null;
  creator_name: string | null;
  created_at: string;
  uniqid: string | null;
  data: string | null;
  medias: string | null;
  game_data?: string | null;
  scenario_layout?: string | null;
  status?: string | null;
  version?: string | null;
}

function getGameVersion(scenario: Scenario): string | null {
  return scenario.version || null;
}

// Reads `game_meta` out of a scenario's `data` column, tolerating both the flat
// (`game_meta.…`) and wrapped (`data.game_meta.…`) envelopes.
function getScenarioMeta(scenario: Scenario): Record<string, unknown> {
  const dataSource = scenario.data || scenario.game_data;
  if (!dataSource) return {};
  try {
    const obj = typeof dataSource === 'string' ? JSON.parse(dataSource) : dataSource;
    return (obj?.game_meta ?? obj?.data?.game_meta ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Resolved age bands, with the read-side fallback (synthesize from game_public
// for un-backfilled rows).
function getScenarioBands(scenario: Scenario): AudienceBand[] {
  const meta = getScenarioMeta(scenario);
  return resolveBands(meta.audience_bands, meta.game_public);
}

// Difficulty as an integer 1–5 (legacy enum strings coerced). Returns null when
// the scenario carries no difficulty at all.
function getScenarioDifficulty(scenario: Scenario): number | null {
  const meta = getScenarioMeta(scenario);
  if (meta.difficulty === undefined || meta.difficulty === null || meta.difficulty === '') return null;
  return coerceDifficulty(meta.difficulty);
}

// Free-text univers tags.
function getScenarioUnivers(scenario: Scenario): string[] {
  return normalizeUnivers(getScenarioMeta(scenario).univers);
}

// Tag Hunter GO: whether the scenario exists in GO mode.
function isScenarioGo(scenario: Scenario): boolean {
  return getScenarioMeta(scenario).adaptable_go === true;
}

// Tag Hunter Drop: the hardware-free on-screen-image variant. Independent of
// GO - a scenario can be both (project_taghunter_drop).
function isScenarioDrop(scenario: Scenario): boolean {
  return getScenarioMeta(scenario).adaptable_drop === true;
}

// The base provenance/status filters plus, dynamically, one entry per
// registered game type (its `kind`, e.g. 'mystery' | 'tagquest' | 'tracks').
// The `(string & {})` keeps literal autocomplete while accepting any game-type kind.
type ScenarioFilter = 'all' | 'products' | 'client-authored' | 'drafts' | (string & {});

export function ScenariosView({ initialFilter = 'all' }: { initialFilter?: ScenarioFilter } = {}) {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [filter, setFilter] = useState<ScenarioFilter>(initialFilter);
  // One filter chip per registered game type. Driven by the adapter registry,
  // so adding a game type (a `registerAdapter(...)` line in bootstrap.ts) makes
  // its chip appear here automatically.
  const gameTypeFilters = useMemo(
    () => listRegisteredAdapters().map((a) => ({ key: a.kind, label: a.label })),
    [],
  );
  // Map a game-type code to its registry display label (e.g. `tracks` → "Track").
  // Falls back to the raw value, so it's safe to call on scenario_type keys too.
  const gameTypeLabels = useMemo(
    () => Object.fromEntries(listRegisteredAdapters().map((a) => [a.kind, a.label])),
    [],
  );
  const labelForGameType = (code?: string) => (code && gameTypeLabels[code]) || code || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [imageLabel, setImageLabel] = useState<string>('');
  const [imageError, setImageError] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [detectedLanguages, setDetectedLanguages] = useState<string[]>([]);
  const [parsedGameData, setParsedGameData] = useState<any>(null);
  const [scenarioFiles, setScenarioFiles] = useState<any[]>([]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupBy, setGroupBy] = useState<'scenario_type' | 'game_type'>('scenario_type');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGameTypesModal, setShowGameTypesModal] = useState(false);
  // Catalog metadata filters - independent multi-selects, AND across categories,
  // OR within each. A scenario passes the band filter if it includes ANY selected
  // band; the difficulty filter if its level is in the selected set; the univers
  // filter if it carries ANY selected tag.
  const [bandFilters, setBandFilters] = useState<Set<AudienceBand>>(new Set());
  const [difficultyFilters, setDifficultyFilters] = useState<Set<number>>(new Set());
  const [universFilters, setUniversFilters] = useState<Set<string>>(new Set());
  const [difficultySort, setDifficultySort] = useState<'none' | 'asc' | 'desc'>('none');

  useEffect(() => {
    fetchScenarios();
  }, []);

  // Distinct univers tags across all loaded scenarios - drives the univers filter chips.
  const universPool = useMemo(() => {
    const pool = new Set<string>();
    for (const s of scenarios) for (const tag of getScenarioUnivers(s)) pool.add(tag);
    return Array.from(pool).sort((a, b) => a.localeCompare(b));
  }, [scenarios]);

  const toggleSetItem = <T,>(setState: React.Dispatch<React.SetStateAction<Set<T>>>, item: T) =>
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  useEffect(() => {
    if (selectedScenario?.uniqid) {
      findImages(selectedScenario);
      detectLanguages(selectedScenario);
      fetchScenarioFiles(selectedScenario.id);
    }
  }, [selectedScenario]);

  const detectLanguages = (scenario: Scenario) => {
    setDetectedLanguages([]);
    setParsedGameData(null);

    const dataSource = scenario.data || scenario.game_data;
    if (!dataSource) {
      return;
    }

    try {
      const dataObj = JSON.parse(dataSource);
      setParsedGameData(dataObj);

      const languages = new Set<string>();

      if (dataObj.available_languages && Array.isArray(dataObj.available_languages)) {
        dataObj.available_languages.forEach((lang: string) => {
          languages.add(lang.toUpperCase());
        });
      }

      if (dataObj.translations && typeof dataObj.translations === 'object') {
        Object.keys(dataObj.translations).forEach(lang => {
          languages.add(lang.toUpperCase());
        });
      }

      if (dataObj.default_language && typeof dataObj.default_language === 'string') {
        languages.add(dataObj.default_language.toUpperCase());
      }

      if (languages.size === 0) {
        const commonLanguageCodes = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar', 'ko'];

        const detectInObject = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;

          Object.keys(obj).forEach(key => {
            const lowerKey = key.toLowerCase();

            commonLanguageCodes.forEach(langCode => {
              if (lowerKey.endsWith(`_${langCode}`) || lowerKey === langCode) {
                languages.add(langCode.toUpperCase());
              }
            });

            if (typeof obj[key] === 'object' && obj[key] !== null) {
              detectInObject(obj[key]);
            }
          });
        };

        detectInObject(dataObj);
      }

      setDetectedLanguages(Array.from(languages).sort());
    } catch (e) {
      console.error('Failed to detect languages in data', e);
    }
  };

  const findImages = (scenario: Scenario) => {
    setImageError(false);
    setFallbackAttempted(false);
    setDisplayImage(null);
    setImageLabel('');

    console.log('Finding images for scenario:', scenario.title);
    console.log('Scenario uniqid:', scenario.uniqid);
    console.log('Scenario medias:', scenario.medias);
    console.log('Scenario data:', scenario.data);

    if (!scenario.uniqid) {
      console.log('No uniqid found');
      return;
    }

    let gameVisualUrl: string | null = null;
    let backgroundUrl: string | null = null;

    if (scenario.medias) {
      try {
        const medias = JSON.parse(scenario.medias);
        console.log('Parsed medias:', medias);

        if (medias.images?.game_visual) {
          gameVisualUrl = medias.images.game_visual.startsWith('http')
            ? medias.images.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${medias.images.game_visual}`;
          console.log('Found game_visual from medias.images.game_visual:', gameVisualUrl);
        }

        if (medias.images?.background_image) {
          backgroundUrl = medias.images.background_image.startsWith('http')
            ? medias.images.background_image
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${medias.images.background_image}`;
          console.log('Found background_image from medias.images.background_image:', backgroundUrl);
        }
      } catch (e) {
        console.error('Failed to parse medias', e);
      }
    }

    if (!gameVisualUrl && !backgroundUrl && scenario.game_data) {
      try {
        const gameData = JSON.parse(scenario.game_data);
        console.log('Parsed game_data (fallback):', gameData);

        if (gameData.media?.images?.game_visual) {
          gameVisualUrl = gameData.media.images.game_visual.startsWith('http')
            ? gameData.media.images.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.media.images.game_visual}`;
          console.log('Found game_visual (new structure):', gameVisualUrl);
        } else if (gameData.data?.game_meta?.game_visual) {
          gameVisualUrl = gameData.data.game_meta.game_visual.startsWith('http')
            ? gameData.data.game_meta.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.data.game_meta.game_visual}`;
          console.log('Found game_visual (new data structure):', gameVisualUrl);
        } else if (gameData.game_meta?.game_visual) {
          gameVisualUrl = gameData.game_meta.game_visual.startsWith('http')
            ? gameData.game_meta.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.game_meta.game_visual}`;
          console.log('Found game_visual (old structure):', gameVisualUrl);
        } else if (gameData.game_visual) {
          gameVisualUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.game_visual}`;
          console.log('Found game_visual (legacy):', gameVisualUrl);
        }

        if (gameData.media?.images?.background_image) {
          backgroundUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.media.images.background_image}`;
          console.log('Found background_image (new structure):', backgroundUrl);
        } else if (gameData.data?.game_meta?.background_image) {
          backgroundUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.data.game_meta.background_image}`;
          console.log('Found background_image (new data structure):', backgroundUrl);
        } else if (gameData.game_meta?.background_image) {
          backgroundUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.game_meta.background_image}`;
          console.log('Found background_image (old structure):', backgroundUrl);
        } else if (gameData.backgroundImage) {
          backgroundUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.backgroundImage}`;
          console.log('Found backgroundImage (legacy):', backgroundUrl);
        }
      } catch (e) {
        console.error('Failed to parse game_data', e);
      }
    }

    if (gameVisualUrl) {
      console.log('Setting display image to game_visual');
      setDisplayImage(gameVisualUrl);
      setImageLabel('Game Visual');
    } else if (backgroundUrl) {
      console.log('Setting display image to backgroundImage');
      setDisplayImage(backgroundUrl);
      setImageLabel('Background Image');
    } else {
      console.log('No images found in game_data');
    }
  };

  const handleImageError = () => {
    console.log('Image failed to load:', displayImage);
    console.log('Current label:', imageLabel);
    console.log('Fallback attempted:', fallbackAttempted);

    if (!fallbackAttempted && selectedScenario?.uniqid) {
      try {
        let backgroundUrl: string | null = null;

        if (selectedScenario.medias) {
          const medias = JSON.parse(selectedScenario.medias);
          if (imageLabel === 'Game Visual' && medias.images?.background_image) {
            backgroundUrl = medias.images.background_image;
          }
        }

        if (!backgroundUrl && selectedScenario.game_data) {
          const gameData = JSON.parse(selectedScenario.game_data);
          if (imageLabel === 'Game Visual') {
            backgroundUrl = gameData.media?.images?.background_image ||
                           gameData.data?.game_meta?.background_image ||
                           gameData.game_meta?.background_image ||
                           gameData.backgroundImage;
          }
        }

        if (backgroundUrl) {
          console.log('Trying fallback to backgroundImage');
          setFallbackAttempted(true);
          const fullUrl = backgroundUrl.startsWith('http')
            ? backgroundUrl
            : `${MEDIA_BASE_URL}/media/${selectedScenario.uniqid}/${backgroundUrl}`;
          setDisplayImage(fullUrl);
          setImageLabel('Background Image');
          setImageError(false);
          return;
        }
      } catch (e) {
        console.error('Failed to parse data for fallback', e);
      }
    }
    console.log('No fallback available, marking as error');
    setImageError(true);
  };

  const fetchScenarios = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_BASE_URL}/scenarios.php?action=list`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchScenarioFiles = async (scenarioId: number) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/scenario_files.php?action=list&scenario_id=${scenarioId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const data = await response.json();
      setScenarioFiles(data.data || data.files || []);
    } catch (err) {
      console.error('Failed to fetch scenario files:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedScenario || newStatus === selectedScenario.status) return;
    setStatusUpdating(true);
    setStatusError(null);
    try {
      const formData = new FormData();
      formData.append('id', String(selectedScenario.id));
      formData.append('status', newStatus);
      const response = await authFetch(`${API_BASE_URL}/scenarios.php?action=update`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to update status');
      }
      const updated = { ...selectedScenario, status: newStatus };
      setSelectedScenario(updated);
      setScenarios(prev => prev.map(s => s.id === selectedScenario.id ? updated : s));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setUploadFile(files[0]);
      if (!uploadFileName) {
        setUploadFileName(files[0].name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadFile || !uploadFileName || !selectedScenario) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setUploadLoading(true);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadFileName);
      formData.append('scenario_id', selectedScenario.id.toString());

      const response = await authFetch(`${API_BASE_URL}/scenario_files.php?action=upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const data = await response.json();
      const newFile = data.data || data.file;
      if (newFile) {
        setScenarioFiles([newFile, ...scenarioFiles]);
      }
      setUploadFileName('');
      setUploadFile(null);

      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDownloadFile = (file: { name?: string; file_path?: string }) => {
    if (!file.file_path) return;
    const url = `${MEDIA_BASE_URL}/media/${file.file_path}`;
    const ext = getFileExt(file);
    const suggested = file.name ? (ext && !file.name.toLowerCase().endsWith('.' + ext) ? `${file.name}.${ext}` : file.name) : '';
    const a = document.createElement('a');
    a.href = url;
    if (suggested) a.download = suggested;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadZip = async () => {
    if (!selectedScenario?.uniqid) return;
    try {
      setZipDownloading(true);
      const response = await authFetch(
        `${API_BASE_URL}/scenario_files.php?action=download_zip&uniqid=${encodeURIComponent(selectedScenario.uniqid)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to download zip' }));
        throw new Error(err.error || 'Failed to download zip');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scenario_${selectedScenario.uniqid}_files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download zip');
    } finally {
      setZipDownloading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/scenario_files.php?action=delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ id: fileId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      setScenarioFiles(scenarioFiles.filter(f => f.id !== fileId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileExt = (file: { name?: string; file_path?: string }): string => {
    const source = file.file_path || file.name || '';
    const m = source.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    return m ? m[1].toLowerCase() : '';
  };

  const getFileKind = (file: { mime_type?: string; name?: string; file_path?: string }):
    'image' | 'video' | 'audio' | 'archive' | 'pdf' | 'json' | 'code' | 'text' | 'other' => {
    const mime = (file.mime_type || '').toLowerCase();
    const ext = getFileExt(file);
    if (mime.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg','bmp','avif'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4','webm','mov','mkv','avi','ogv'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3','wav','ogg','flac','m4a','aac'].includes(ext)) return 'audio';
    if (mime.includes('zip') || mime.includes('compressed') || ['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mime.includes('json') || ext === 'json') return 'json';
    if (['js','jsx','ts','tsx','html','css','xml','yaml','yml','php','py','sh','rb','go','rs','java','c','cpp','cs'].includes(ext)) return 'code';
    if (mime.startsWith('text/') || ['txt','md','csv','log'].includes(ext)) return 'text';
    return 'other';
  };

  const getFileTypeLabel = (file: { mime_type?: string; name?: string; file_path?: string }): string => {
    const ext = getFileExt(file);
    if (ext) return ext.toUpperCase();
    const mime = file.mime_type || '';
    const sub = mime.split('/')[1];
    return sub ? sub.toUpperCase() : 'FILE';
  };

  const fileThumbnailUrl = (file: { file_path?: string }): string | null => {
    if (!file.file_path) return null;
    return `${MEDIA_BASE_URL}/media/${file.file_path}`;
  };

  const FileTypeIcon = ({ kind, className }: { kind: ReturnType<typeof getFileKind>; className?: string }) => {
    const cls = className ?? 'w-5 h-5';
    switch (kind) {
      case 'image': return <FileImage className={`${cls} text-emerald-500`} />;
      case 'video': return <FileVideo className={`${cls} text-purple-500`} />;
      case 'audio': return <FileAudio className={`${cls} text-pink-500`} />;
      case 'archive': return <FileArchive className={`${cls} text-amber-500`} />;
      case 'pdf': return <FileText className={`${cls} text-red-500`} />;
      case 'json': return <FileJson className={`${cls} text-blue-500`} />;
      case 'code': return <FileCode className={`${cls} text-indigo-500`} />;
      case 'text': return <FileText className={`${cls} text-slate-500`} />;
      default: return <File className={`${cls} text-slate-400`} />;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this scenario?')) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/scenarios.php?action=delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete scenario');
      }

      setScenarios(scenarios.filter(s => s.id !== id));
      setSelectedScenario(null);
      setDisplayImage(null);
      setImageLabel('');
      setImageError(false);
      setFallbackAttempted(false);
      setDetectedLanguages([]);
      setParsedGameData(null);
      setScenarioFiles([]);
      setUploadFileName('');
      setUploadFile(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete scenario');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (selectedScenario) {
    const detailBands = getScenarioBands(selectedScenario);
    const detailUnivers = getScenarioUnivers(selectedScenario);
    const difficulty = getScenarioDifficulty(selectedScenario);

    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedScenario(null);
            setDisplayImage(null);
            setImageLabel('');
            setImageError(false);
            setFallbackAttempted(false);
            setDetectedLanguages([]);
            setParsedGameData(null);
            setScenarioFiles([]);
            setUploadFileName('');
            setUploadFile(null);
          }}
          className="text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Back to scenarios
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedScenario.title}</h3>

            <div className="flex items-center flex-wrap gap-6 text-sm text-slate-600 mb-4">
              <div className="flex items-center space-x-2">
                <GameTypeIcon type={selectedScenario.game_type} className="w-4 h-4" />
                <span className="font-medium capitalize">{labelForGameType(selectedScenario.game_type)}</span>
              </div>
              {getGameVersion(selectedScenario) && (
                <div className="flex items-center space-x-2">
                  <Tag className="w-4 h-4" />
                  <span className="px-2 py-1 bg-emerald-100 rounded text-xs font-semibold text-emerald-700">
                    Version {getGameVersion(selectedScenario)}
                  </span>
                </div>
              )}
              {selectedScenario.scenario_type && (
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-700 capitalize">
                    {selectedScenario.scenario_type}
                  </span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <select
                    value={selectedScenario.status || 'draft'}
                    onChange={e => handleStatusChange(e.target.value)}
                    disabled={statusUpdating}
                    className={`appearance-none pl-2 pr-6 py-1 rounded text-xs font-semibold capitalize border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                      (selectedScenario.status || 'draft') === 'published'
                        ? 'bg-green-100 text-green-700 border-green-200 focus:ring-green-400'
                        : (selectedScenario.status || 'draft') === 'archived'
                        ? 'bg-slate-200 text-slate-600 border-slate-300 focus:ring-slate-400'
                        : 'bg-amber-100 text-amber-700 border-amber-200 focus:ring-amber-400'
                    }`}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>
                {statusUpdating && (
                  <span className="text-xs text-slate-400 animate-pulse">Saving...</span>
                )}
                {statusError && (
                  <span className="text-xs text-red-500">{statusError}</span>
                )}
              </div>
              {selectedScenario.creator_name && (
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Published by {selectedScenario.creator_name}</span>
                </div>
              )}
              {(detailBands.length > 0 || difficulty !== null || detailUnivers.length > 0) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {detailBands.map((band) => (
                    <span key={band} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {getBandLabel(band)}
                    </span>
                  ))}
                  {difficulty !== null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getDifficultyBadgeClass(difficulty)}`}>
                      <Gauge className="w-3 h-3" />
                      {formatDifficultyStars(difficulty)}
                    </span>
                  )}
                  {detailUnivers.map((tag) => (
                    <span key={tag} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(selectedScenario.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {detectedLanguages.length > 0 && (
              <div className="mt-4 flex items-start space-x-2">
                <Globe className="w-4 h-4 text-slate-600 mt-0.5" />
                <div>
                  <span className="text-sm font-semibold text-slate-700 block mb-2">Available Languages</span>
                  <div className="flex flex-wrap gap-2">
                    {detectedLanguages.map((lang) => (
                      <span
                        key={lang}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {displayImage && !imageError && (
                <div className="lg:col-span-1">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>{imageLabel}</span>
                  </h4>
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={displayImage}
                      alt={imageLabel}
                      className="w-full h-auto object-contain"
                      onError={handleImageError}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
              <div className={displayImage && !imageError ? 'lg:col-span-2' : 'lg:col-span-3'}>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
                <p className="text-slate-600 whitespace-pre-wrap">{selectedScenario.description}</p>
              </div>
            </div>

            {selectedScenario.client_name && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Client</h4>
                <p className="text-slate-600">
                  {selectedScenario.client_name} ({selectedScenario.client_email})
                </p>
              </div>
            )}

            <div className="mb-6 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                  <File className="w-4 h-4" />
                  <span>Scenario Files</span>
                </h4>
                {scenarioFiles.length > 0 && (
                  <button
                    onClick={handleDownloadZip}
                    disabled={zipDownloading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Download all files as ZIP"
                  >
                    <FileArchive className="w-4 h-4" />
                    <span>{zipDownloading ? 'Preparing ZIP…' : 'Download all (ZIP)'}</span>
                  </button>
                )}
              </div>

              {scenarioFiles.length > 0 ? (
                <div className="space-y-2">
                  {scenarioFiles.map((file) => {
                    const kind = getFileKind(file);
                    const typeLabel = getFileTypeLabel(file);
                    const thumb = kind === 'image' ? fileThumbnailUrl(file) : null;
                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="w-12 h-12 flex-shrink-0 rounded-md bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={file.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  img.style.display = 'none';
                                  img.parentElement?.setAttribute('data-fallback', 'true');
                                }}
                              />
                            ) : (
                              <FileTypeIcon kind={kind} className="w-6 h-6" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                            <p className="text-xs text-slate-500">
                              <span className="inline-block px-1.5 py-0.5 mr-2 rounded bg-slate-100 text-slate-600 font-semibold tracking-wide">
                                {typeLabel}
                              </span>
                              {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                            title="Download file"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No files uploaded yet</p>
              )}

              <form onSubmit={handleFileUpload} className="mt-6 bg-slate-50 p-4 rounded-lg">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 mb-4 transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      {uploadFile ? uploadFile.name : 'Drag and drop your file here'}
                    </p>
                    <p className="text-xs text-slate-500 mb-3">or</p>
                    <label
                      htmlFor="file-upload"
                      className="inline-block px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-all"
                    >
                      Browse Files
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setUploadFile(file);
                        if (file && !uploadFileName) {
                          setUploadFileName(file.name.replace(/\.[^/.]+$/, ''));
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    File Display Name
                  </label>
                  <input
                    type="text"
                    value={uploadFileName}
                    onChange={(e) => setUploadFileName(e.target.value)}
                    placeholder="Enter a name for this file"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploadLoading || !uploadFile}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  <span>{uploadLoading ? 'Uploading...' : 'Upload File'}</span>
                </button>
              </form>
            </div>

            {parsedGameData && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                  <FileJson className="w-4 h-4" />
                  <span>Game Data (JSON)</span>
                </h4>
                <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(parsedGameData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleDelete(selectedScenario.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all inline-flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Scenario</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }

  const matchesProvenance = (s: Scenario): boolean => {
    if (filter === 'all') return true;
    if (filter === 'products') return s.scenario_type === 'product' || s.client_id === null;
    if (filter === 'client-authored') return s.scenario_type === 'custom' || s.client_id !== null;
    if (filter === 'drafts') return (s.status || 'draft') === 'draft';
    if (filter === 'go') return isScenarioGo(s);
    if (filter === 'drop') return isScenarioDrop(s);
    // Otherwise `filter` is a game-type kind (e.g. 'mystery' | 'tagquest' | 'tracks').
    return s.game_type === filter;
  };

  // AND across the metadata categories, OR within each.
  const matchesMetadata = (s: Scenario): boolean => {
    if (bandFilters.size > 0) {
      const bands = getScenarioBands(s);
      if (!bands.some((b) => bandFilters.has(b))) return false;
    }
    if (difficultyFilters.size > 0) {
      const d = getScenarioDifficulty(s);
      if (d === null || !difficultyFilters.has(d)) return false;
    }
    if (universFilters.size > 0) {
      const tags = getScenarioUnivers(s).map((t) => t.toLowerCase());
      if (!tags.some((t) => universFilters.has(t))) return false;
    }
    return true;
  };

  const filteredScenarios = scenarios.filter((s) => matchesProvenance(s) && matchesMetadata(s));

  // Apply the difficulty sort (when active) before grouping so both the grid
  // groups and the list view inherit the order.
  const byDifficulty = (a: Scenario, b: Scenario) => {
    const da = getScenarioDifficulty(a) ?? 0;
    const db = getScenarioDifficulty(b) ?? 0;
    return difficultySort === 'asc' ? da - db : db - da;
  };
  const orderedScenarios =
    difficultySort === 'none' ? filteredScenarios : [...filteredScenarios].sort(byDifficulty);

  const groupedScenarios = orderedScenarios.reduce((acc, scenario) => {
    const key =
      groupBy === 'game_type'
        ? scenario.game_type || 'Uncategorized'
        : scenario.scenario_type || 'Uncategorized';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(scenario);
    return acc;
  }, {} as Record<string, Scenario[]>);

  const scenarioTypes = Object.keys(groupedScenarios).sort();

  const sortedListScenarios =
    difficultySort !== 'none'
      ? orderedScenarios
      : groupBy === 'game_type'
      ? [...filteredScenarios].sort((a, b) =>
          (a.game_type || '').localeCompare(b.game_type || '') ||
          a.title.localeCompare(b.title)
        )
      : filteredScenarios;

  const getScenarioThumbnail = (scenario: Scenario): string | null => {
    if (!scenario.uniqid) return null;

    let gameVisualUrl: string | null = null;
    let backgroundUrl: string | null = null;

    if (scenario.medias) {
      try {
        const medias = JSON.parse(scenario.medias);
        if (medias.images?.game_visual) {
          gameVisualUrl = medias.images.game_visual.startsWith('http')
            ? medias.images.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${medias.images.game_visual}`;
        }
        if (medias.images?.background_image) {
          backgroundUrl = medias.images.background_image.startsWith('http')
            ? medias.images.background_image
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${medias.images.background_image}`;
        }
      } catch (e) {
        console.error('Failed to parse medias', e);
      }
    }

    if (!gameVisualUrl && !backgroundUrl && scenario.data) {
      try {
        const gameData = JSON.parse(scenario.data);
        if (gameData.media?.images?.game_visual) {
          gameVisualUrl = gameData.media.images.game_visual.startsWith('http')
            ? gameData.media.images.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.media.images.game_visual}`;
        } else if (gameData.data?.game_meta?.game_visual) {
          gameVisualUrl = gameData.data.game_meta.game_visual.startsWith('http')
            ? gameData.data.game_meta.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.data.game_meta.game_visual}`;
        } else if (gameData.game_meta?.game_visual) {
          gameVisualUrl = gameData.game_meta.game_visual.startsWith('http')
            ? gameData.game_meta.game_visual
            : `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.game_meta.game_visual}`;
        } else if (gameData.game_visual) {
          gameVisualUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${gameData.game_visual}`;
        }

        if (!backgroundUrl && (gameData.media?.images?.background_image || gameData.data?.game_meta?.background_image || gameData.game_meta?.background_image || gameData.backgroundImage)) {
          backgroundUrl = gameData.media?.images?.background_image ||
                         gameData.data?.game_meta?.background_image ||
                         gameData.game_meta?.background_image ||
                         gameData.backgroundImage;
          if (backgroundUrl && !backgroundUrl.startsWith('http')) {
            backgroundUrl = `${MEDIA_BASE_URL}/media/${scenario.uniqid}/${backgroundUrl}`;
          }
        }
      } catch (e) {
        console.error('Failed to parse data', e);
      }
    }

    return gameVisualUrl || backgroundUrl;
  };

  const renderScenarioCard = (scenario: Scenario) => {
    const thumbnailUrl = getScenarioThumbnail(scenario);
    const bands = getScenarioBands(scenario);
    const difficulty = getScenarioDifficulty(scenario);
    const univers = getScenarioUnivers(scenario);

    return (
      <div
        key={scenario.id}
        className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all"
      >
        {thumbnailUrl && (
          <div className="relative w-full aspect-square bg-slate-100">
            <img
              src={thumbnailUrl}
              alt={scenario.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              loading="lazy"
            />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 mb-2">{scenario.title}</h3>
              <p className="text-sm text-slate-600 line-clamp-2">{scenario.description}</p>
            </div>
          </div>

          {/* Scenario data in two columns: identity (left) + version/badges (right). */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <GameTypeIcon type={scenario.game_type} className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium capitalize truncate">{labelForGameType(scenario.game_type)}</span>
              </div>
              {scenario.creator_name && (
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{scenario.creator_name}</span>
                </div>
              )}
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{new Date(scenario.created_at).toLocaleDateString()}</span>
              </div>
              {scenario.client_name && (
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Client: {scenario.client_name}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 min-w-0">
              {getGameVersion(scenario) && (
                <div className="inline-flex items-center space-x-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  <Tag className="w-3 h-3" />
                  <span>v{getGameVersion(scenario)}</span>
                </div>
              )}
              {isScenarioGo(scenario) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-emerald-700 bg-emerald-100">
                  GO
                </span>
              )}
              {isScenarioDrop(scenario) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-sky-700 bg-sky-100">
                  DROP
                </span>
              )}
              {bands.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-indigo-700 bg-indigo-50">
                  <User className="w-3 h-3" />
                  {bands.map((b) => getBandLabel(b)).join(' · ')}
                </span>
              )}
              {difficulty !== null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getDifficultyBadgeClass(difficulty)}`}>
                  <Gauge className="w-3 h-3" />
                  {formatDifficultyStars(difficulty)}
                </span>
              )}
              {univers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {univers.map((tag) => (
                    <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-violet-700 bg-violet-50">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {scenario.status && (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                  scenario.status === 'published'
                    ? 'bg-green-100 text-green-700'
                    : scenario.status === 'archived'
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {scenario.status}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedScenario(scenario)}
              className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all inline-flex items-center justify-center space-x-2"
            >
              <Eye className="w-4 h-4" />
              <span>View Details</span>
            </button>
            {scenario.uniqid && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/studio/scenarios/${scenario.uniqid}`);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all inline-flex items-center justify-center space-x-2"
                title="Edit in Studio"
              >
                <Pencil className="w-4 h-4" />
                <span>Edit in Studio</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderScenarioRow = (scenario: Scenario) => {
    const version = getGameVersion(scenario);
    return (
      <tr
        key={scenario.id}
        className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group"
        onClick={() => setSelectedScenario(scenario)}
      >
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900 group-hover:text-slate-700">{scenario.title}</div>
          {scenario.description && (
            <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5">{scenario.description}</div>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 capitalize">
            <GameTypeIcon type={scenario.game_type} className="w-4 h-4 text-slate-400" />
            {labelForGameType(scenario.game_type)}
          </span>
        </td>
        <td className="px-4 py-3">
          {scenario.scenario_type ? (
            <span className="px-2 py-0.5 rounded text-xs font-semibold text-slate-600 bg-slate-100 capitalize">
              {scenario.scenario_type}
            </span>
          ) : (
            <span className="text-slate-300 text-xs">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const bands = getScenarioBands(scenario);
            return bands.length > 0 ? (
              <span className="px-2 py-0.5 rounded text-xs font-semibold text-indigo-700 bg-indigo-50">
                {bands.map((b) => getBandLabel(b)).join(' · ')}
              </span>
            ) : (
              <span className="text-slate-300 text-xs">-</span>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const difficulty = getScenarioDifficulty(scenario);
            return difficulty !== null ? (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getDifficultyBadgeClass(difficulty)}`}>
                {formatDifficultyStars(difficulty)}
              </span>
            ) : (
              <span className="text-slate-300 text-xs">-</span>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          {version ? (
            <span className="px-2 py-0.5 rounded text-xs font-semibold text-emerald-700 bg-emerald-50">
              v{version}
            </span>
          ) : (
            <span className="text-slate-300 text-xs">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {scenario.status ? (
            <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
              scenario.status === 'published'
                ? 'bg-green-100 text-green-700'
                : scenario.status === 'archived'
                ? 'bg-slate-200 text-slate-600'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {scenario.status}
            </span>
          ) : (
            <span className="text-slate-300 text-xs">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {scenario.client_name ? (
            <span className="text-sm text-slate-600 truncate max-w-[140px] block">{scenario.client_name}</span>
          ) : (
            <span className="text-slate-300 text-xs">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
          {new Date(scenario.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedScenario(scenario); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
              title="View details"
            >
              <Eye className="w-4 h-4" />
            </button>
            {scenario.uniqid && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/studio/scenarios/${scenario.uniqid}`); }}
                className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-all"
                title="Edit in Studio"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-slate-600">
            {filteredScenarios.length} {filteredScenarios.length === 1 ? 'scenario' : 'scenarios'}
            {filter !== 'all' && ` (${scenarios.length} total)`}
          </p>
          <HelpButton chapter="scenarios" className="text-slate-400 hover:text-slate-700" />
        </div>
        <ScenarioListControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupBy={groupBy}
          onGroupByChange={(v) => setGroupBy(v as 'scenario_type' | 'game_type')}
          groupOptions={[
            { value: 'scenario_type', label: 'Scenario type' },
            { value: 'game_type', label: 'Game type' },
          ]}
          extraActions={
            <>
              <button
                onClick={() => navigate('/studio/scenarios/new')}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                title="Create a new scenario"
              >
                <Plus className="w-4 h-4" />
                Create scenario
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                title="Import a legacy Taghunter ZIP"
              >
                <FileArchive className="w-4 h-4" />
                Import legacy ZIP
              </button>
              <button
                onClick={() => setShowGameTypesModal(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                title="Enable or disable game types"
              >
                <Gauge className="w-4 h-4" />
                Manage game types
              </button>
            </>
          }
        />
      </div>

      <ImportLegacyZipModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          setShowImportModal(false);
          fetchScenarios();
        }}
      />

      <ManageGameTypesModal
        open={showGameTypesModal}
        onClose={() => setShowGameTypesModal(false)}
        onChanged={fetchScenarios}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'all', label: 'All' },
          { key: 'products', label: 'Products' },
          { key: 'client-authored', label: 'Client-authored' },
          { key: 'drafts', label: 'Drafts' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Tag Hunter GO filter - scenarios that exist in GO mode. */}
        {scenarios.some((s) => isScenarioGo(s)) && (
          <button
            type="button"
            onClick={() => setFilter('go')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === 'go'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300'
            }`}
          >
            GO
          </button>
        )}

        {/* Tag Hunter Drop filter - scenarios marked "Adaptable à Drop". */}
        {scenarios.some((s) => isScenarioDrop(s)) && (
          <button
            type="button"
            onClick={() => setFilter('drop')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === 'drop'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-sky-700 border-sky-200 hover:border-sky-300'
            }`}
          >
            DROP
          </button>
        )}

        {gameTypeFilters.length > 0 && (
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        )}

        {gameTypeFilters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <GameTypeIcon type={key} className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}

      </div>

      {/* Catalog metadata filters: age bands, difficulty stars, univers tags, and
          a difficulty sort toggle. AND across categories, OR within each. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Age</span>
        {AUDIENCE_BANDS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => toggleSetItem(setBandFilters, b.value)}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              bandFilters.has(b.value)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {getBandLabel(b.value)}
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Difficulty</span>
        {DIFFICULTY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => toggleSetItem<number>(setDifficultyFilters, level)}
            title={`${level} / 5`}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              difficultyFilters.has(level)
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {'★'.repeat(level)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDifficultySort((s) => (s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none'))}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-sm rounded-full border transition-colors ${
            difficultySort !== 'none'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
          title="Sort by difficulty"
        >
          <Gauge className="w-3.5 h-3.5" />
          {difficultySort === 'asc' ? '↑' : difficultySort === 'desc' ? '↓' : 'Sort'}
        </button>

        {universPool.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Univers</span>
            {universPool.map((tag) => {
              const key = tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleSetItem(setUniversFilters, key)}
                  className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                    universFilters.has(key)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </>
        )}

        {(bandFilters.size > 0 || difficultyFilters.size > 0 || universFilters.size > 0 || difficultySort !== 'none') && (
          <button
            type="button"
            onClick={() => {
              setBandFilters(new Set());
              setDifficultyFilters(new Set());
              setUniversFilters(new Set());
              setDifficultySort('none');
            }}
            className="ml-1 px-2.5 py-1 text-sm rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {filteredScenarios.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Film className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {scenarios.length === 0 ? 'No scenarios yet' : 'No scenarios match this filter'}
          </h3>
          <p className="text-slate-600">
            {scenarios.length === 0
              ? 'Scenarios will appear here once they are created.'
              : 'Try a different filter or switch to All.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-8">
          {scenarioTypes.map((type) => (
            <div key={type} className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-px flex-1 bg-slate-200"></div>
                <h3 className="text-lg font-bold text-slate-900 px-4 py-2 bg-slate-100 rounded-lg capitalize">
                  {labelForGameType(type)}
                </h3>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedScenarios[type].map((scenario) => renderScenarioCard(scenario))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Game Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Audience</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Difficulty</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Version</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedListScenarios.map((scenario) => renderScenarioRow(scenario))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
