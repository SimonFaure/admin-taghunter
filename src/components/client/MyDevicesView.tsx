import { Smartphone, Calendar, Package, HardDrive, Trash2, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { useState, useEffect, KeyboardEvent } from 'react';
import { getDevices, deleteDevice, updateDevice, Device } from '../../lib/devicesApi';

const MAX_DISPLAY_NAME = 120;

export function MyDevicesView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (device: Device) => {
    setEditingId(device.id);
    setDraft(device.display_name ?? device.device_label ?? '');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveEdit = async (device: Device) => {
    const trimmed = draft.trim();
    if (trimmed.length > MAX_DISPLAY_NAME) {
      setError(`Name must be ${MAX_DISPLAY_NAME} characters or fewer`);
      return;
    }
    try {
      setSaving(true);
      await updateDevice({
        device_uniq: device.device_uniq,
        display_name: trimmed === '' ? null : trimmed,
      });
      setEditingId(null);
      setDraft('');
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename device');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, device: Device) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(device);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      console.error('Failed to load devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (deviceUniq: string) => {
    if (!confirm('Are you sure you want to delete this device? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDevice(deviceUniq);
      setSuccess('Device deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      await loadDevices();
    } catch (err) {
      console.error('Failed to delete device:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete device');
      setTimeout(() => setError(''), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(error || success) && (
        <div className={`p-4 rounded-lg ${
          error
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'bg-green-50 border border-green-200 text-green-600'
        }`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error || success}</span>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Smartphone className="w-6 h-6" />
              <span>My Devices</span>
            </h2>
            <p className="text-slate-600 mt-1">
              Manage your registered devices
            </p>
          </div>
          <div className="text-sm text-slate-600">
            {devices.length} {devices.length === 1 ? 'device' : 'devices'} registered
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Smartphone className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Devices Registered</h3>
            <p className="text-slate-600">
              Your devices will appear here once they connect to the platform
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => (
              <div
                key={device.id}
                className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-6 h-6 text-slate-700" />
                    </div>
                    <div className="min-w-0">
                      {editingId === device.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, device)}
                            maxLength={MAX_DISPLAY_NAME + 1}
                            placeholder={device.device_label ?? 'Device name'}
                            className="border border-slate-300 rounded px-2 py-1 text-sm font-semibold text-slate-900 w-40"
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(device)}
                            disabled={saving}
                            title="Save"
                            className="p-1 rounded hover:bg-green-50 text-green-600 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            title="Cancel"
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {device.display_name || device.device_label || 'Device'}
                          </h3>
                          <button
                            type="button"
                            onClick={() => startEdit(device)}
                            title="Rename"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-opacity"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 font-mono truncate">{device.device_uniq}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(device.device_uniq)}
                    className="text-red-600 hover:text-red-700 transition-colors p-2 hover:bg-red-50 rounded-lg"
                    title="Delete device"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-2 text-sm">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">Version:</span>{' '}
                      {device.playground_version || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">Cards:</span>{' '}
                      v{device.cards_file_version || 0}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">Registered:</span>{' '}
                      {new Date(device.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">Last Seen:</span>{' '}
                      {new Date(device.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">About Devices</p>
            <p>
              Devices are automatically registered when they first connect to your account.
              The system tracks their version and cards file status to ensure they stay up to date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
