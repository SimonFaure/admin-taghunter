import { Smartphone, Calendar, Package, HardDrive, Trash2, AlertCircle, Pencil, Check, X, Server, Wifi, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { getDevices, deleteDevice, updateDevice, getLanNetworks, wifiQrPayload, Device, LanNetwork } from '../../lib/devicesApi';
import { HelpButton } from '../../help';

const MAX_DISPLAY_NAME = 120;

export function MyDevicesView() {
  const { t, i18n } = useTranslation('devicesList');
  const [devices, setDevices] = useState<Device[]>([]);
  const [networks, setNetworks] = useState<LanNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealPw, setRevealPw] = useState<Set<number>>(new Set());

  const togglePw = (id: number) =>
    setRevealPw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      setError(t('nameTooLong', { max: MAX_DISPLAY_NAME }));
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
      setError(err instanceof Error ? err.message : t('renameFailed'));
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
      // Best-effort: the hotspots panel is supplementary, so a failure here
      // (e.g. table not migrated) must not break the device list.
      try {
        setNetworks(await getLanNetworks());
      } catch {
        setNetworks([]);
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (deviceUniq: string) => {
    if (!confirm(t('deleteConfirm'))) {
      return;
    }

    try {
      await deleteDevice(deviceUniq);
      setSuccess(t('deleteSuccess'));
      setTimeout(() => setSuccess(''), 3000);
      await loadDevices();
    } catch (err) {
      console.error('Failed to delete device:', err);
      setError(err instanceof Error ? err.message : t('deleteFailed'));
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
              <span>{t('title')}</span>
              <HelpButton chapter="devices" className="text-slate-400 hover:text-slate-700 ml-1" />
            </h2>
            <p className="text-slate-600 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            {t('registeredCount', { count: devices.length })}
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Smartphone className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('empty.title')}</h3>
            <p className="text-slate-600">
              {t('empty.subtitle')}
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
                            placeholder={device.device_label ?? t('namePlaceholder')}
                            className="border border-slate-300 rounded px-2 py-1 text-sm font-semibold text-slate-900 w-40"
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(device)}
                            disabled={saving}
                            title={t('save')}
                            className="p-1 rounded hover:bg-green-50 text-green-600 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            title={t('cancel')}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {device.display_name || device.device_label || t('deviceFallback')}
                          </h3>
                          <button
                            type="button"
                            onClick={() => startEdit(device)}
                            title={t('rename')}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-opacity"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 font-mono truncate">{device.device_uniq}</p>
                      {device.is_default_mother ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 border border-indigo-200">
                          <Server className="w-3 h-3" /> {t('defaultGameServer')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(device.device_uniq)}
                    className="text-red-600 hover:text-red-700 transition-colors p-2 hover:bg-red-50 rounded-lg"
                    title={t('deleteDevice')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-2 text-sm">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">{t('labelVersion')}</span>{' '}
                      {device.playground_version || t('notAvailable')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">{t('labelCards')}</span>{' '}
                      v{device.cards_file_version || 0}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">{t('labelRegistered')}</span>{' '}
                      {new Date(device.created_at).toLocaleDateString(i18n.language)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">{t('labelLastSeen')}</span>{' '}
                      {new Date(device.updated_at).toLocaleDateString(i18n.language)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {networks.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
            <Wifi className="w-6 h-6" />
            <span>{t('hotspots.title')}</span>
          </h2>
          <p className="text-slate-600 mb-4 text-sm">
            {t('hotspots.subtitle')}
          </p>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {networks.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-4 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Wifi className="w-4 h-4 text-slate-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 font-mono truncate">{n.ssid}</p>
                    {n.password && (
                      <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                        <span className="truncate">
                          {revealPw.has(n.id) ? n.password : '••••••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePw(n.id)}
                          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                          aria-label={t('hotspots.togglePassword')}
                        >
                          {revealPw.has(n.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </p>
                    )}
                  </div>
                </div>
                {n.password && (
                  <div className="bg-white p-1.5 rounded border border-slate-200 flex-shrink-0">
                    <QRCodeSVG value={wifiQrPayload(n.ssid, n.password)} size={64} level="M" marginSize={0} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">{t('about.title')}</p>
            <p>
              {t('about.body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
