import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, FileText, CreditCard, RefreshCw, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { onDemandCardsApi, OnDemandPoolCard, OnDemandPoolMeta } from '../lib/api';

interface OnDemandPoolModalProps {
  onClose: () => void;
}

type Tab = 'pool' | 'upload';

export function OnDemandPoolModal({ onClose }: OnDemandPoolModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pool');
  const [poolMeta, setPoolMeta] = useState<OnDemandPoolMeta | null>(null);
  const [poolCards, setPoolCards] = useState<OnDemandPoolCard[]>([]);
  const [filteredCards, setFilteredCards] = useState<OnDemandPoolCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<{ version: number; count: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPool();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCards(poolCards);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredCards(
        poolCards.filter(
          (c) =>
            c.key_name.toLowerCase().includes(q) ||
            c.key_number.toLowerCase().includes(q) ||
            c.card_id.toLowerCase().includes(q) ||
            c.color.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, poolCards]);

  const fetchPool = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, poolRes] = await Promise.all([
        onDemandCardsApi.getPoolMeta(),
        onDemandCardsApi.getPool(),
      ]);
      if (metaRes.data) setPoolMeta(metaRes.data.data);
      if (poolRes.data) {
        setPoolCards(poolRes.data.data);
        setFilteredCards(poolRes.data.data);
      }
      if (metaRes.error) setError(metaRes.error);
    } catch {
      setError('Failed to load pool');
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }, []);

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv') {
      setUploadError('Only CSV files are allowed');
      return;
    }
    setSelectedFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await onDemandCardsApi.uploadPool(selectedFile);
      if (res.error) {
        setUploadError(res.error);
      } else if (res.data) {
        setUploadSuccess({ version: res.data.version, count: res.data.count });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchPool();
        setActiveTab('pool');
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">On Demand Cards Pool</h2>
              {poolMeta && poolMeta.current_version > 0 && (
                <p className="text-xs text-slate-500">
                  v{poolMeta.current_version} &middot; {poolMeta.card_count} cards &middot; Updated {formatDate(poolMeta.updated_at)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-white px-6">
          {(['pool', 'upload'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'pool' ? 'View Pool' : 'Upload New Pool'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'pool' && (
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-600">{error}</p>
                </div>
              ) : poolCards.length === 0 ? (
                <div className="text-center py-16">
                  <CreditCard className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">No pool uploaded yet</h3>
                  <p className="text-slate-500 mb-4">Upload a CSV file to create your on-demand cards pool</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Pool
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search cards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <button
                      onClick={fetchPool}
                      className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-slate-500 whitespace-nowrap">
                      {filteredCards.length} / {poolCards.length} cards
                    </span>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            {['key_name', 'color', 'key_number', 'id'].map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                {h.replace('_', ' ')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredCards.map((card) => (
                            <tr key={card.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5 text-slate-900 font-medium">{card.key_name || '-'}</td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1.5 text-slate-700">
                                  <span
                                    className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                                    style={{ backgroundColor: card.color || '#ccc' }}
                                  />
                                  {card.color || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">{card.key_number || '-'}</td>
                              <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{card.card_id || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="p-6 max-w-xl mx-auto">
              {uploadSuccess && (
                <div className="mb-5 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Pool uploaded successfully</p>
                    <p className="text-sm">Version {uploadSuccess.version} &middot; {uploadSuccess.count} cards</p>
                  </div>
                </div>
              )}
              {uploadError && (
                <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{uploadError}</p>
                </div>
              )}

              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
                  dragActive
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Upload className={`w-12 h-12 mx-auto mb-3 transition-colors ${dragActive ? 'text-slate-700' : 'text-slate-300'}`} />
                {selectedFile ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-slate-600" />
                      <p className="font-semibold text-slate-900">{selectedFile.name}</p>
                    </div>
                    <p className="text-sm text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB &middot; Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Drop CSV file here</p>
                    <p className="text-sm text-slate-400">or click to browse</p>
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Required CSV Format</p>
                <p className="text-xs text-slate-500 font-mono">key_name, color, key_number, id</p>
                <p className="text-xs text-slate-400 mt-1">Uploading a new pool creates a new version and does not replace the previous pool</p>
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Pool
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
