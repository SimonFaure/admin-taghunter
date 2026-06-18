import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Upload, User, GamepadIcon, Package, Plus, X, ShoppingCart, Key, Eye, EyeOff, AlertTriangle, FileText, Smartphone, Monitor, Calendar, ChevronDown, ChevronRight, ShieldCheck, Search, Server } from 'lucide-react';
import { clientApi } from '../lib/clientApi';
import { Client, LicenseType } from '../types/client';
import { ScenarioData, adminCardsApi } from '../lib/api';
import { authFetch } from '../lib/authFetch';
import { CardsRegistryEditor, CardsEditorApi } from './CardsRegistryEditor';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { ClientGameTypesPanel } from './ClientGameTypesPanel';
import { GameTypeIcon } from './icons/GameTypeIcons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Display labels for game-type codes (e.g. `tracks` → "Track"). Falls back to
// the raw code, so unknown/legacy types still render.
const GAME_TYPE_LABELS: Record<string, string> = {
  mystery: 'Mystery',
  tagquest: 'Tagquest',
  tracks: 'Track',
  clash: 'Clash',
};
const gameTypeLabel = (code?: string | null) => (code && GAME_TYPE_LABELS[code]) || code || '';

interface ClientDevice {
  id: number;
  device_uniq: string;
  device_label: string | null;
  display_name: string | null;
  os: string | null;
  os_version: string | null;
  app_version: string | null;
  cards_file_version: number | null;
  is_default_mother?: number | null;
  update_channel?: string | null;
  last_seen_at: string | null;
  created_at: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
}

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  headerRight?: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  icon,
  title,
  headerRight,
  defaultCollapsed = false,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-8">
        <div className={`flex items-center justify-between ${collapsed ? '' : 'mb-6'}`}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex items-center space-x-3 text-left group"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-700 transition-colors" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-500 group-hover:text-slate-700 transition-colors" />
            )}
            {icon}
            <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          </button>
          {headerRight && <div className="flex items-center gap-3">{headerRight}</div>}
        </div>
        {!collapsed && children}
      </div>
    </div>
  );
}

export function ClientDetailView({ clientId, onBack }: ClientDetailViewProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [boughtScenarios, setBoughtScenarios] = useState<ScenarioData[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [showAddScenarioModal, setShowAddScenarioModal] = useState(false);
  const [availableScenarios, setAvailableScenarios] = useState<ScenarioData[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [scenarioGameType, setScenarioGameType] = useState<string>('all');
  const [addingScenario, setAddingScenario] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<{ scenarioId: string; scenarioTitle: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [devices, setDevices] = useState<ClientDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);

  // Admin-side cards CRUD: same shared editor used by CardsListView's drill-in.
  const clientIdNum = Number(clientId);
  const cardsApi = useMemo<CardsEditorApi>(
    () => ({
      list: () => adminCardsApi.listCards(clientIdNum),
      create: async (card) => {
        await adminCardsApi.createCard(clientIdNum, card);
      },
      update: async (id, fields) => {
        await adminCardsApi.updateCard(clientIdNum, id, fields);
      },
      remove: async (id) => {
        await adminCardsApi.deleteCard(clientIdNum, id);
      },
      importCsv: (file) => adminCardsApi.importCsv(clientIdNum, file),
    }),
    [clientIdNum]
  );

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    company: '',
    phone: '',
    notes: '',
    license_type: 'access' as LicenseType,
    billing_up_to_date: true,
    language: 'fr',
    update_channel: 'stable',
  });

  useEffect(() => {
    loadClient();
    loadScenarios();
    loadDevices();
  }, [clientId]);

  const loadDevices = async () => {
    setLoadingDevices(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/telemetry_admin.php?action=list_devices&client_id=${clientId}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const result = await response.json();
        setDevices(result.data || []);
      }
    } catch (err) {
      console.error('Error loading devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  // Per-device app-update channel override. '' means inherit the client channel.
  const setDeviceChannel = async (deviceId: number, value: string) => {
    // Optimistic: reflect the choice immediately, reload on completion.
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, update_channel: value || null } : d))
    );
    try {
      await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=set_device_channel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, update_channel: value || 'inherit' }),
      });
    } catch (err) {
      console.error('Error setting device channel:', err);
    } finally {
      void loadDevices();
    }
  };

  const loadScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=list&client_id=${clientId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        setBoughtScenarios(result.data || []);
      }
    } catch (err) {
      console.error('Error loading scenarios:', err);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const loadAvailableScenarios = async () => {
    setLoadingAvailable(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/scenarios.php?action=list`, {
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        const productScenarios = result.scenarios.filter((s: ScenarioData) => s.scenario_type === 'product');
        const boughtIds = boughtScenarios.map(s => s.id);
        setAvailableScenarios(productScenarios.filter((s: ScenarioData) => !boughtIds.includes(s.id)));
      }
    } catch (err) {
      console.error('Error loading available scenarios:', err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleAddScenario = async (scenarioId: string) => {
    setAddingScenario(true);
    try {
      console.log('Adding scenario:', { client_id: clientId, scenario_id: scenarioId });
      const response = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ client_id: clientId, scenario_id: scenarioId }),
      });

      console.log('Response status:', response.status, response.statusText);
      const result = await response.json();
      console.log('Response data:', result);

      if (response.ok) {
        setSuccess('Scenario added successfully');
        setTimeout(() => setSuccess(''), 3000);
        await loadScenarios();
        setShowAddScenarioModal(false);
      } else {
        console.error('Server error:', result.error);
        setError(result.error || 'Failed to add scenario');
      }
    } catch (err) {
      console.error('Failed to add scenario:', err);
      setError(`Failed to add scenario: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAddingScenario(false);
    }
  };

  const handleRemoveScenario = (scenarioId: string, scenarioTitle: string) => {
    setRemoveConfirm({ scenarioId, scenarioTitle });
  };

  const confirmRemoveScenario = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ client_id: clientId, scenario_id: removeConfirm.scenarioId }),
      });

      const result = await response.json();

      if (response.ok) {
        setRemoveConfirm(null);
        setSuccess('Scenario removed successfully');
        setTimeout(() => setSuccess(''), 3000);
        await loadScenarios();
      } else {
        setError(result.error || 'Failed to remove scenario');
        setRemoveConfirm(null);
      }
    } catch (err) {
      setError('Failed to remove scenario');
      setRemoveConfirm(null);
    } finally {
      setRemoving(false);
    }
  };

  const openAddScenarioModal = () => {
    setShowAddScenarioModal(true);
    setScenarioSearch('');
    setScenarioGameType('all');
    loadAvailableScenarios();
  };

  const availableGameTypes = useMemo(
    () =>
      Array.from(
        new Set(availableScenarios.map((s) => s.game_type).filter((t): t is string => !!t))
      ).sort(),
    [availableScenarios]
  );

  const filteredAvailableScenarios = useMemo(() => {
    const q = scenarioSearch.trim().toLowerCase();
    return availableScenarios.filter((s) => {
      if (scenarioGameType !== 'all' && s.game_type !== scenarioGameType) return false;
      if (q && !(s.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [availableScenarios, scenarioSearch, scenarioGameType]);

  const loadClient = async () => {
    setLoading(true);
    const { data, error } = await clientApi.getClient(clientId);
    if (error) {
      setError(error);
    } else if (data) {
      setClient(data);
      setFormData({
        email: data.email,
        name: data.name || '',
        company: data.company || '',
        phone: data.phone || '',
        notes: data.notes || '',
        license_type: (data.license_type as LicenseType) || 'access',
        billing_up_to_date: data.billing_up_to_date ?? true,
        language: data.language || 'fr',
        update_channel: data.update_channel || 'stable',
      });
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('client_id', clientId);

      const response = await authFetch(`${API_BASE_URL}/clients.php?action=upload_avatar`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to upload avatar');
      }

      if (result.data) {
        setClient(result.data);
        setSuccess('Avatar uploaded successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const { data, error } = await clientApi.updateClient({
      id: clientId,
      ...formData,
    });

    if (error) {
      setError(error);
    } else if (data) {
      setClient(data);
      setSuccess('Client updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    }

    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setChangingPassword(true);
    setError('');
    setSuccess('');

    const { error } = await clientApi.changePassword(clientId, newPassword);

    if (error) {
      setError(error);
    } else {
      setSuccess('Password changed successfully');
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => setSuccess(''), 3000);
    }

    setChangingPassword(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Client not found</p>
        <button
          onClick={onBack}
          className="mt-4 text-slate-900 hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Clients</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8">
          <div className="flex items-start space-x-8 mb-8">
            <div className="flex-shrink-0">
              <div className="relative">
                {client.avatar_url ? (
                  <img
                    src={client.avatar_url}
                    alt={client.name || 'Client avatar'}
                    className="w-32 h-32 rounded-full object-cover border-4 border-slate-100"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center border-4 border-slate-100">
                    <User className="w-16 h-16 text-slate-400" />
                  </div>
                )}
                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 cursor-pointer transition-all shadow-lg"
                >
                  {uploading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">
                Max 2MB
              </p>
            </div>

            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-900 mb-1">
                {client.name || 'Unnamed Client'}
              </h2>
              <p className="text-slate-600 mb-4">{client.email}</p>
              <div className="flex flex-wrap gap-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  client.license_type === 'premium'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-800'
                }`}>
                  {client.license_type === 'premium' ? 'Premium' : 'Access'} License
                </span>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  client.billing_up_to_date
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {client.billing_up_to_date ? 'Billing Current' : 'Billing Overdue'}
                </span>
              </div>
            </div>
          </div>

          {(error || success) && (
            <div className={`mb-6 p-3 rounded-lg text-sm ${
              error
                ? 'bg-red-50 border border-red-200 text-red-600'
                : 'bg-green-50 border border-green-200 text-green-600'
            }`}>
              {error || success}
            </div>
          )}

          <div className={`flex items-center justify-between border-t border-slate-200 pt-6 ${detailsCollapsed ? '' : 'mb-6'}`}>
            <button
              type="button"
              onClick={() => setDetailsCollapsed((c) => !c)}
              aria-expanded={!detailsCollapsed}
              className="flex items-center space-x-3 text-left group"
            >
              {detailsCollapsed ? (
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-700 transition-colors" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-500 group-hover:text-slate-700 transition-colors" />
              )}
              <User className="w-6 h-6 text-slate-700" />
              <h3 className="text-xl font-bold text-slate-900">Client Details</h3>
            </button>
          </div>

          {!detailsCollapsed && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="client@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Company
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Company Inc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="+33 6 12 34 56 78"
                />
              </div>

            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                License Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="license_type"
                    value="access"
                    checked={formData.license_type === 'access'}
                    onChange={(e) => setFormData({ ...formData, license_type: e.target.value as LicenseType })}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700">Access</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="license_type"
                    value="premium"
                    checked={formData.license_type === 'premium'}
                    onChange={(e) => setFormData({ ...formData, license_type: e.target.value as LicenseType })}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700">Premium</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Billing Status
              </label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="billing_up_to_date"
                    value="true"
                    checked={formData.billing_up_to_date === true}
                    onChange={() => setFormData({ ...formData, billing_up_to_date: true })}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700">Up to Date</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="billing_up_to_date"
                    value="false"
                    checked={formData.billing_up_to_date === false}
                    onChange={() => setFormData({ ...formData, billing_up_to_date: false })}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700">Overdue</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Language
              </label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                The client's Studio UI language, the playground onboarding default, and the default language of new scenarios they create.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                App update channel
              </label>
              <select
                value={formData.update_channel}
                onChange={(e) => setFormData({ ...formData, update_channel: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="stable">Stable</option>
                <option value="test">Test (Tester)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Which app-release track this client's playground devices download updates from. Set to
                Test to make this account a tester. Individual devices can override this below.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="Additional information about the client..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onBack}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>

      <CollapsibleSection
        icon={<Smartphone className="w-6 h-6 text-slate-700" />}
        title="Devices"
        defaultCollapsed
        headerRight={
          <span className="text-sm text-slate-600">
            {devices.length} {devices.length === 1 ? 'device' : 'devices'}
          </span>
        }
      >
          {loadingDevices ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <Smartphone className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">No devices registered</p>
              <p className="text-sm text-slate-500 mt-1">
                Playground installs appear here once they connect to this client's account
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Smartphone className="w-6 h-6 text-slate-700" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">
                        {device.display_name || device.device_label || 'Device'}
                      </h4>
                      <p
                        className="text-xs text-slate-500 font-mono truncate"
                        title={device.device_uniq}
                      >
                        {device.device_uniq}
                      </p>
                      {device.is_default_mother ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 border border-indigo-200">
                          <Server className="w-3 h-3" /> Default game server
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center space-x-2 text-sm">
                      <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-600">
                        <span className="font-medium text-slate-700">Playground:</span>{' '}
                        {device.app_version || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <Monitor className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-600">
                        <span className="font-medium text-slate-700">OS:</span>{' '}
                        {device.os
                          ? `${device.os}${device.os_version ? ' ' + device.os_version : ''}`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-slate-600">
                        <span className="font-medium text-slate-700">Last seen:</span>{' '}
                        {formatRelative(device.last_seen_at)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <label className="text-slate-600 flex items-center gap-2 w-full">
                        <span className="font-medium text-slate-700 whitespace-nowrap">Update channel:</span>
                        <select
                          value={device.update_channel || ''}
                          onChange={(e) => void setDeviceChannel(device.id, e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                        >
                          <option value="">Inherit ({formData.update_channel})</option>
                          <option value="stable">Stable</option>
                          <option value="test">Test</option>
                        </select>
                      </label>
                    </div>
                    {device.update_channel === 'test' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                        Tester device
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        icon={<GamepadIcon className="w-6 h-6 text-slate-700" />}
        title="Game types"
        defaultCollapsed
      >
        <ClientGameTypesPanel clientId={clientIdNum} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<ShieldCheck className="w-6 h-6 text-slate-700" />}
        title="Recovery codes"
        defaultCollapsed
      >
        <RecoveryCodesPanel clientId={clientIdNum} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Key className="w-6 h-6 text-slate-700" />}
        title="Change Password"
        defaultCollapsed
      >
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Enter new password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Confirm new password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={changingPassword || !newPassword || !confirmPassword}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </form>
      </CollapsibleSection>

      <div className="mt-6">
        <CardsRegistryEditor
          api={cardsApi}
          title="Cards"
          description="Register, edit, delete, or bulk-import cards for this client."
          collapsible
          defaultCollapsed
        />
      </div>

      <CollapsibleSection
        icon={<ShoppingCart className="w-6 h-6 text-slate-700" />}
        title="Product Scenarios"
        defaultCollapsed
        headerRight={
          <>
            {client?.license_type === 'access' && (
              <button
                onClick={openAddScenarioModal}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Product Scenario
              </button>
            )}
            <span className="text-sm text-slate-600">
              {boughtScenarios.filter(s => s.scenario_type === 'product').length} total
            </span>
          </>
        }
      >
          {loadingScenarios ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : boughtScenarios.filter(s => s.scenario_type === 'product').length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <ShoppingCart className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">No product scenarios assigned</p>
              <p className="text-sm text-slate-500 mt-1">
                Use the button above to grant product scenarios to this client
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                {boughtScenarios.filter(s => s.scenario_type === 'product').map((scenario) => (
                  <div
                    key={scenario.id}
                    className="border border-amber-200 bg-amber-50/30 rounded-lg px-4 py-3 hover:border-amber-300 transition-colors flex items-center gap-3"
                  >
                    {scenario.game_type && (
                      <GameTypeIcon type={scenario.game_type} className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    )}
                    <h4 className="font-semibold text-slate-900 truncate">
                      {scenario.title}
                    </h4>
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium flex-shrink-0">
                      Product
                    </span>
                    {scenario.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${
                        scenario.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : scenario.status === 'archived'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {scenario.status}
                      </span>
                    )}
                    {scenario.uniqid && (
                      <span className="text-xs text-slate-500 font-mono truncate hidden sm:inline" title={scenario.uniqid}>
                        {scenario.uniqid}
                      </span>
                    )}
                    <div className="flex-1" />
                    {client?.license_type === 'access' && (
                      <button
                        onClick={() => handleRemoveScenario(scenario.id, scenario.title)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                        title="Remove scenario"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {client?.license_type === 'premium' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Premium License:</span> This client has access to all product scenarios automatically.
                  </p>
                </div>
              )}
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        icon={<FileText className="w-6 h-6 text-slate-700" />}
        title="Custom Scenarios"
        defaultCollapsed
        headerRight={
          <span className="text-sm text-slate-600">
            {boughtScenarios.filter(s => s.scenario_type === 'custom').length} total
          </span>
        }
      >
          {loadingScenarios ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : boughtScenarios.filter(s => s.scenario_type === 'custom').length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">No custom scenarios</p>
              <p className="text-sm text-slate-500 mt-1">
                Custom scenarios created by this client will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {boughtScenarios.filter(s => s.scenario_type === 'custom').map((scenario) => (
                <div
                  key={scenario.id}
                  className="border border-blue-200 bg-blue-50/30 rounded-lg p-6 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <h4 className="text-lg font-semibold text-slate-900">
                      {scenario.title}
                    </h4>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                      Custom
                    </span>
                    {scenario.status && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                        scenario.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : scenario.status === 'archived'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {scenario.status}
                      </span>
                    )}
                  </div>
                  {scenario.description && (
                    <p className="text-slate-600 text-sm leading-relaxed mb-4">
                      {scenario.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 pt-4 border-t border-blue-100">
                    {scenario.game_type && (
                      <div className="flex items-center space-x-2 text-sm">
                        <GamepadIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600">
                          <span className="font-medium text-slate-700">Game Type:</span>{' '}
                          {gameTypeLabel(scenario.game_type)}
                        </span>
                      </div>
                    )}
                    {scenario.uniqid && (
                      <div className="flex items-center space-x-2 text-sm">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-600">
                          <span className="font-medium text-slate-700">ID:</span>{' '}
                          {scenario.uniqid}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </CollapsibleSection>

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Remove Product Scenario</h3>
                  <p className="text-sm text-slate-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-600 mb-1">You are about to remove:</p>
                <p className="font-semibold text-slate-900">"{removeConfirm.scenarioTitle}"</p>
                <p className="text-sm text-slate-500 mt-2">
                  from <span className="font-medium text-slate-700">{client?.name || client?.email}</span>
                </p>
              </div>

              <p className="text-sm text-slate-600 mb-6">
                The client will immediately lose access to this product scenario and all its associated content.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setRemoveConfirm(null)}
                  disabled={removing}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveScenario}
                  disabled={removing}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {removing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      Remove Scenario
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddScenarioModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Add Product Scenarios</h3>
              <button
                onClick={() => setShowAddScenarioModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {!loadingAvailable && availableScenarios.length > 0 && (
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scenarioSearch}
                    onChange={(e) => setScenarioSearch(e.target.value)}
                    placeholder="Search scenarios..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  />
                </div>
                <select
                  value={scenarioGameType}
                  onChange={(e) => setScenarioGameType(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm capitalize"
                >
                  <option value="all">All game types</option>
                  {availableGameTypes.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {gameTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              {loadingAvailable ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
                </div>
              ) : availableScenarios.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600">No product scenarios available</p>
                  <p className="text-sm text-slate-500 mt-1">
                    All product scenarios have been added to this client
                  </p>
                </div>
              ) : filteredAvailableScenarios.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600">No scenarios match your filters</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAvailableScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="border border-slate-200 rounded-lg px-4 py-3 hover:border-slate-300 transition-colors flex items-center gap-3"
                    >
                      {scenario.game_type && (
                        <GameTypeIcon type={scenario.game_type} className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}
                      <h4 className="font-semibold text-slate-900 truncate">{scenario.title}</h4>
                      {scenario.game_type && (
                        <span className="text-xs text-slate-500 capitalize hidden sm:inline flex-shrink-0">
                          {gameTypeLabel(scenario.game_type)}
                        </span>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={() => handleAddScenario(scenario.id)}
                        disabled={addingScenario}
                        className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                      >
                        {addingScenario ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
