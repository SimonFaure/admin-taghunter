import { CreditCard, Upload, Trash2, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { getCardsMetadata, uploadCardsFile, deleteCardsFile, downloadCardsFile, CardsMetadata, getCardsData, CardData } from '../../lib/cardsApi';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function MyToolsView() {
  const { user } = useSecureAuth();
  const [cardsMetadata, setCardsMetadata] = useState<CardsMetadata | null>(null);
  const [cardsData, setCardsData] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [metadata, cardsDataResult] = await Promise.all([
        getCardsMetadata(),
        getCardsData().catch(() => null)
      ]);
      setCardsMetadata(metadata);
      setCardsData(cardsDataResult?.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('error', 'Only CSV files are allowed');
      return;
    }

    try {
      setUploading(true);
      const result = await uploadCardsFile(file);
      await loadData();
      showToast('success', `Cards file uploaded successfully! Version ${result.version}`);
    } catch (error) {
      console.error('Failed to upload cards:', error);
      showToast('error', `Failed to upload cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await downloadCardsFile();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cards.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('success', 'Cards file downloaded successfully');
    } catch (error) {
      console.error('Failed to download cards:', error);
      showToast('error', 'Failed to download cards file');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete the cards file? This action cannot be undone.')) return;

    try {
      setLoading(true);
      await deleteCardsFile();
      await loadData();
      showToast('success', 'Cards file deleted successfully');
    } catch (error) {
      console.error('Failed to delete cards:', error);
      showToast('error', 'Failed to delete cards file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 relative">
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg border-2 min-w-80 animate-slide-in ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-500 text-green-900'
                : toast.type === 'error'
                ? 'bg-red-50 border-red-500 text-red-900'
                : 'bg-blue-50 border-blue-500 text-blue-900'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
            {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            {toast.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />}
            <span className="font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <CreditCard className="w-6 h-6" />
              <span>My Cards</span>
            </h2>
            <p className="text-slate-600 mt-1">
              Upload and manage your game cards CSV file
            </p>
            <div className="mt-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2 inline-block">
              <strong>Expected format:</strong> CSV with headers: <code className="bg-slate-200 px-1 rounded">key_name</code>, <code className="bg-slate-200 px-1 rounded">color</code>, <code className="bg-slate-200 px-1 rounded">key_number</code>, <code className="bg-slate-200 px-1 rounded">id</code>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {cardsMetadata?.has_file && (
              <>
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div
          className={`mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            {uploading ? 'Uploading Cards File...' : 'Upload Cards CSV File'}
          </h3>
          <p className="text-slate-600 mb-2">
            {uploading ? 'Please wait while we process your file...' : 'Drag and drop your CSV file here, or click to browse'}
          </p>
          {!uploading && (
            <div className="text-sm text-slate-500 space-y-1">
              <p className="font-medium">Only CSV files are accepted</p>
              <p className="text-xs mt-2">Required headers: key_name, color, key_number, id</p>
              <p className="text-xs">Note: This will replace any existing cards file</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {cardsMetadata?.has_file ? (
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Cards File Info</h3>
                  <div className="space-y-1 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium">Version:</span> {cardsMetadata.version}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium">Last Updated:</span>{' '}
                      {new Date(cardsMetadata.updated_at).toLocaleString()}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium">Total Cards:</span> {cardsData.length}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-700">Active</span>
                </div>
              </div>
            </div>

            {cardsData.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900">Cards Data</h3>
                  <p className="text-sm text-slate-600 mt-1">Preview of your uploaded cards</p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {Object.keys(cardsData[0]).map((header) => (
                          <th
                            key={header}
                            className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {cardsData.map((card, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          {Object.values(card).map((value, idx) => (
                            <td key={idx} className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cards File Uploaded</h3>
            <p className="text-slate-600">
              Upload a CSV file to enable cards functionality for your devices
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
