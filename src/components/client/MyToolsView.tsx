import { CreditCard, Smartphone, Upload, Trash2, Download } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { getCardsMetadata, uploadCardsFile, deleteCardsFile, downloadCardsFile, CardsMetadata } from '../../lib/cardsApi';
import { getDevices, Device } from '../../lib/devicesApi';

export function MyToolsView() {
  const { user } = useSecureAuth();
  const [cardsMetadata, setCardsMetadata] = useState<CardsMetadata | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [metadata, devicesData] = await Promise.all([
        getCardsMetadata(),
        getDevices()
      ]);
      setCardsMetadata(metadata);
      setDevices(devicesData);
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
      alert('Only CSV files are allowed');
      return;
    }

    try {
      setUploading(true);
      const result = await uploadCardsFile(file);
      await loadData();
      alert(`Cards file uploaded successfully! Version ${result.version}`);
    } catch (error) {
      console.error('Failed to upload cards:', error);
      alert(`Failed to upload cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    } catch (error) {
      console.error('Failed to download cards:', error);
      alert('Failed to download cards file');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete the cards file? This action cannot be undone.')) return;

    try {
      setLoading(true);
      await deleteCardsFile();
      await loadData();
      alert('Cards file deleted successfully');
    } catch (error) {
      console.error('Failed to delete cards:', error);
      alert('Failed to delete cards file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
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
              <p className="text-xs mt-2">Note: This will replace any existing cards file</p>
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
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-700">Active</span>
              </div>
            </div>
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Smartphone className="w-6 h-6" />
              <span>My Devices</span>
            </h2>
            <p className="text-slate-600 mt-1">
              Connected game devices using your cards
            </p>
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Smartphone className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Devices Found</h3>
            <p className="text-slate-600">
              Devices will appear here automatically when they connect using your client ID
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Device ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Playground Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Cards File Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                    Last Connected
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {device.device_uniq}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {device.playground_version || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {device.cards_file_version}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(device.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
