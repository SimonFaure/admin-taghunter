import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, User, FileText, Calendar, GamepadIcon, Package, Plus, X, ShoppingCart, Key, Eye, EyeOff, CreditCard } from 'lucide-react';
import { clientApi } from '../lib/clientApi';
import { Client, LicenseType } from '../types/client';
import { scenariosApi, ScenarioData } from '../lib/api';

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
}

export function ClientDetailView({ clientId, onBack }: ClientDetailViewProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [boughtScenarios, setBoughtScenarios] = useState<ScenarioData[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [showAddScenarioModal, setShowAddScenarioModal] = useState(false);
  const [availableScenarios, setAvailableScenarios] = useState<ScenarioData[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [addingScenario, setAddingScenario] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cardsMetadata, setCardsMetadata] = useState<any>(null);
  const [cardsData, setCardsData] = useState<any[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [uploadingCards, setUploadingCards] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    company: '',
    phone: '',
    notes: '',
    license_type: 'access' as LicenseType,
    billing_up_to_date: true,
    playground_version: '',
    creator_version: '',
  });

  useEffect(() => {
    loadClient();
    loadScenarios();
    loadCardsMetadata();
  }, [clientId]);

  const loadCardsMetadata = async () => {
    setLoadingCards(true);
    try {
      console.log('Loading cards metadata for client:', clientId);
      const [metadataResponse, dataResponse] = await Promise.all([
        fetch(`https://admin.taghunter.fr/backend/api/cards.php?action=admin_get_metadata&client_id=${clientId}`, {
          credentials: 'include',
        }),
        fetch(`https://admin.taghunter.fr/backend/api/cards.php?action=admin_get_data&client_id=${clientId}`, {
          credentials: 'include',
        }).catch(() => null)
      ]);

      console.log('Metadata response status:', metadataResponse.status);
      if (metadataResponse.ok) {
        const result = await metadataResponse.json();
        console.log('Metadata result:', result);
        setCardsMetadata(result.data || null);
      } else {
        const errorText = await metadataResponse.text();
        console.error('Metadata error response:', errorText);
      }

      if (dataResponse && dataResponse.ok) {
        const dataResult = await dataResponse.json();
        console.log('Cards data result:', dataResult);
        setCardsData(dataResult.data || []);
      } else {
        setCardsData([]);
      }
    } catch (err) {
      console.error('Error loading cards metadata:', err);
    } finally {
      setLoadingCards(false);
    }
  };

  const loadScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const { data, error } = await scenariosApi.listScenarios(clientId);
      if (!error && data) {
        setScenarios(data.scenarios);
      }

      const response = await fetch(`https://admin.taghunter.fr/backend/api/client_scenarios.php?action=list&client_id=${clientId}`, {
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
      const response = await fetch('https://admin.taghunter.fr/backend/api/scenarios.php?action=list', {
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
      const response = await fetch('https://admin.taghunter.fr/backend/api/client_scenarios.php?action=add', {
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

  const handleRemoveScenario = async (scenarioId: string) => {
    if (!confirm('Are you sure you want to remove this scenario from the client?')) {
      return;
    }

    try {
      const response = await fetch('https://admin.taghunter.fr/backend/api/client_scenarios.php?action=remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ client_id: clientId, scenario_id: scenarioId }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('Scenario removed successfully');
        setTimeout(() => setSuccess(''), 3000);
        await loadScenarios();
      } else {
        setError(result.error || 'Failed to remove scenario');
      }
    } catch (err) {
      setError('Failed to remove scenario');
    }
  };

  const openAddScenarioModal = () => {
    setShowAddScenarioModal(true);
    loadAvailableScenarios();
  };

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
        playground_version: data.playground_version || '',
        creator_version: data.creator_version || '',
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

      const response = await fetch('https://admin.taghunter.fr/backend/api/clients.php?action=upload_avatar', {
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
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleCardsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileUpload(file);
    e.target.value = '';
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setUploadingCards(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('client_id', clientId);

      console.log('Uploading file for client:', clientId);

      const response = await fetch('https://admin.taghunter.fr/backend/api/cards.php?action=admin_upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to upload cards file');
      }

      setSuccess('Cards file uploaded successfully');
      setTimeout(() => setSuccess(''), 3000);
      await loadCardsMetadata();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload cards file');
    } finally {
      setUploadingCards(false);
    }
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
                {client.playground_version && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    <Package className="w-3.5 h-3.5" />
                    Playground v{client.playground_version}
                  </span>
                )}
                {client.creator_version && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    <Package className="w-3.5 h-3.5" />
                    Creator v{client.creator_version}
                  </span>
                )}
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Playground Version
                </label>
                <input
                  type="text"
                  value={formData.playground_version}
                  onChange={(e) => setFormData({ ...formData, playground_version: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="1.0.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Creator Version
                </label>
                <input
                  type="text"
                  value={formData.creator_version}
                  onChange={(e) => setFormData({ ...formData, creator_version: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="1.0.0"
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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="p-8">
          <div className="flex items-center space-x-3 mb-6">
            <Key className="w-6 h-6 text-slate-700" />
            <h3 className="text-xl font-bold text-slate-900">Change Password</h3>
          </div>

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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <CreditCard className="w-6 h-6 text-slate-700" />
              <h3 className="text-xl font-bold text-slate-900">Cards File</h3>
            </div>
            {cardsMetadata?.has_file && (
              <span className="text-sm text-slate-600">
                Version {cardsMetadata.version} • Updated {new Date(cardsMetadata.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {loadingCards ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  dragActive
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                } ${uploadingCards ? 'opacity-50 pointer-events-none' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {uploadingCards ? 'Uploading Cards File...' : (cardsMetadata?.has_file ? 'Replace Cards File' : 'Upload Cards File')}
                </h3>
                <p className="text-slate-600 mb-2">
                  {uploadingCards ? 'Please wait while we process your file...' : 'Drag and drop your CSV file here, or click to browse'}
                </p>
                {!uploadingCards && cardsMetadata?.has_file && (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-600 mt-3">
                    <FileText className="w-4 h-4" />
                    <span>Current file: Version {cardsMetadata.version}</span>
                  </div>
                )}
                {!uploadingCards && (
                  <div className="text-sm text-slate-500 space-y-1 mt-4">
                    <p className="font-medium">Only CSV files are accepted</p>
                    {cardsMetadata?.has_file && (
                      <p className="text-xs mt-2">Note: This will replace the existing cards file</p>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCardsUpload}
                  className="hidden"
                />
              </div>
              <p className="text-sm text-slate-500">
                Upload a CSV file containing the card data for this client. The file will be versioned and can be accessed by the client's devices.
              </p>
            </div>
          )}

          {cardsMetadata?.has_file && cardsData.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-slate-200">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">Cards Data Preview</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {cardsData.length} cards in file
                </p>
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
                            {String(value)}
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
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-slate-700" />
              <h3 className="text-xl font-bold text-slate-900">Scenarios</h3>
            </div>
            <div className="flex items-center gap-3">
              {client?.license_type === 'access' && (
                <button
                  onClick={openAddScenarioModal}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Product Scenarios
                </button>
              )}
              <span className="text-sm text-slate-600">
                {scenarios.length + boughtScenarios.length} total
              </span>
            </div>
          </div>

          {loadingScenarios ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : scenarios.length === 0 && boughtScenarios.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">No scenarios yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Scenarios created by or granted to this client will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {scenarios.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Created Scenarios ({scenarios.length})</h4>
                  <div className="space-y-4">
                    {scenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-slate-900 mb-1">
                              {scenario.title}
                            </h4>
                            {scenario.description && (
                              <p className="text-slate-600 text-sm leading-relaxed">
                                {scenario.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-100">
                          {scenario.game_type && (
                            <div className="flex items-center space-x-2 text-sm">
                              <GamepadIcon className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-600">
                                <span className="font-medium text-slate-700">Game Type:</span>{' '}
                                {scenario.game_type}
                              </span>
                            </div>
                          )}
                          {scenario.scenario_type && (
                            <div className="flex items-center space-x-2 text-sm">
                              <Package className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-600">
                                <span className="font-medium text-slate-700">Category:</span>{' '}
                                {scenario.scenario_type}
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
                          <div className="flex items-center space-x-2 text-sm">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600">
                              <span className="font-medium text-slate-700">Created:</span>{' '}
                              {new Date(scenario.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>

                        {scenario.media_url && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <a
                              href={scenario.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              View media file
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {boughtScenarios.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Product Scenarios ({boughtScenarios.length})
                  </h4>
                  <div className="space-y-4">
                    {boughtScenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className="border border-amber-200 bg-amber-50/30 rounded-lg p-6 hover:border-amber-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-lg font-semibold text-slate-900">
                                {scenario.title}
                              </h4>
                              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
                                Product
                              </span>
                            </div>
                            {scenario.description && (
                              <p className="text-slate-600 text-sm leading-relaxed">
                                {scenario.description}
                              </p>
                            )}
                          </div>
                          {client?.license_type === 'access' && (
                            <button
                              onClick={() => handleRemoveScenario(scenario.id)}
                              className="ml-4 text-red-600 hover:text-red-700 transition-colors"
                              title="Remove scenario"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-amber-100">
                          {scenario.game_type && (
                            <div className="flex items-center space-x-2 text-sm">
                              <GamepadIcon className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-600">
                                <span className="font-medium text-slate-700">Game Type:</span>{' '}
                                {scenario.game_type}
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

                        {scenario.media_url && (
                          <div className="mt-4 pt-4 border-t border-amber-100">
                            <a
                              href={scenario.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              View media file
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {client?.license_type === 'premium' && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Premium License:</span> This client has access to all product scenarios automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
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
              ) : (
                <div className="space-y-3">
                  {availableScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">{scenario.title}</h4>
                        {scenario.description && (
                          <p className="text-sm text-slate-600">{scenario.description}</p>
                        )}
                        {scenario.game_type && (
                          <p className="text-xs text-slate-500 mt-2">
                            Game Type: {scenario.game_type}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddScenario(scenario.id)}
                        disabled={addingScenario}
                        className="ml-4 px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
