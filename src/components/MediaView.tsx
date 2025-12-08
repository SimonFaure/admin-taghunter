import { useState, useEffect } from 'react';
import { Image, Calendar, HardDrive, Film, X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MediaFile {
  id: string;
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: {
    size?: number;
    mimetype?: string;
    [key: string]: unknown;
  } | null;
}

interface Scenario {
  id: string;
  title: string;
  game_type: string;
  slug: string;
  created_at: string;
}

export function MediaView() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [relatedScenarios, setRelatedScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  useEffect(() => {
    fetchMediaFiles();
  }, []);

  useEffect(() => {
    if (selectedMedia) {
      fetchRelatedScenarios(selectedMedia.name);
    }
  }, [selectedMedia]);

  const fetchMediaFiles = async () => {
    if (!supabase) {
      setError('Supabase client not initialized');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('objects')
        .select('id, name, bucket_id, created_at, updated_at, metadata')
        .eq('bucket_id', 'scenario-media')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setMediaFiles(data || []);
    } catch (err) {
      console.error('Error fetching media files:', err);
      setError('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedScenarios = async (mediaName: string) => {
    if (!supabase) return;

    setLoadingScenarios(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('scenarios')
        .select('id, title, game_type, slug, created_at')
        .ilike('media_url', `%${mediaName}%`);

      if (fetchError) throw fetchError;
      setRelatedScenarios(data || []);
    } catch (err) {
      console.error('Error fetching related scenarios:', err);
      setRelatedScenarios([]);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getPublicUrl = (name: string): string => {
    if (!supabase) return '';
    const { data } = supabase.storage
      .from('scenario-media')
      .getPublicUrl(name);
    return data.publicUrl;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (selectedMedia) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedMedia(null)}
          className="text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Back to media files
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedMedia.name}</h3>
                <div className="flex items-center space-x-6 text-sm text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(selectedMedia.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-4 h-4" />
                    <span>{formatFileSize(selectedMedia.metadata?.size as number)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedMedia(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">File Details</h4>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">File Name:</span>
                  <span className="font-medium text-slate-900">{selectedMedia.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Type:</span>
                  <span className="font-medium text-slate-900">
                    {selectedMedia.metadata?.mimetype || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Size:</span>
                  <span className="font-medium text-slate-900">
                    {formatFileSize(selectedMedia.metadata?.size as number)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Created:</span>
                  <span className="font-medium text-slate-900">
                    {new Date(selectedMedia.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Last Updated:</span>
                  <span className="font-medium text-slate-900">
                    {new Date(selectedMedia.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Public URL</h4>
              <div className="bg-slate-50 rounded-lg p-3">
                <code className="text-xs text-slate-600 break-all">{getPublicUrl(selectedMedia.name)}</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center space-x-2">
                <Film className="w-4 h-4" />
                <span>Used in Scenarios</span>
              </h4>
              {loadingScenarios ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                </div>
              ) : relatedScenarios.length === 0 ? (
                <div className="bg-slate-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600">No scenarios are using this media file</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-semibold text-slate-900 mb-1">{scenario.title}</h5>
                          <div className="flex items-center space-x-4 text-sm text-slate-600">
                            <span className="font-medium">{scenario.game_type}</span>
                            <span>•</span>
                            <span>{new Date(scenario.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mediaFiles.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <Image className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Media Files</h3>
          <p className="text-slate-600">No media files have been uploaded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mediaFiles.map((media) => (
            <div
              key={media.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Image className="w-5 h-5 text-slate-600" />
                      <h3 className="text-base font-bold text-slate-900 truncate">{media.name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {media.metadata?.mimetype || 'Unknown type'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <HardDrive className="w-4 h-4" />
                    <span>{formatFileSize(media.metadata?.size as number)}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(media.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedMedia(media)}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all inline-flex items-center justify-center space-x-2"
                >
                  <span>View Details</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
