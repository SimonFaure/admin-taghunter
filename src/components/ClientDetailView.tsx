import { useState, useEffect } from 'react';
import { ArrowLeft, Upload, User, CheckCircle, FileText, Calendar, GamepadIcon, Package } from 'lucide-react';
import { clientApi } from '../lib/clientApi';
import { Client, LicenseType } from '../types/client';
import { supabase } from '../lib/supabase';

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
  const [pendingInstallation, setPendingInstallation] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);

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
    checkPendingInstallation();
    loadScenarios();
  }, [clientId]);

  const checkPendingInstallation = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('client_id', clientId)
        .eq('type', 'app_installation_request')
        .eq('is_read', false)
        .maybeSingle();

      if (!error && data) {
        setPendingInstallation(data);
      }
    } catch (err) {
      console.error('Error checking pending installation:', err);
    }
  };

  const loadScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setScenarios(data);
      }
    } catch (err) {
      console.error('Error loading scenarios:', err);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const handleConfirmInstallation = async () => {
    if (!pendingInstallation) return;

    setConfirming(true);
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', pendingInstallation.id);

      setSuccess('Taghunter Creator app installation confirmed');
      setPendingInstallation(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to confirm installation');
      setTimeout(() => setError(''), 3000);
    } finally {
      setConfirming(false);
    }
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

    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }

      if (client?.avatar_url) {
        const oldPath = client.avatar_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('avatars').remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { data: updatedClient, error: updateError } = await clientApi.updateClient({
        id: clientId,
        avatar_url: publicUrl,
      });

      if (updateError) throw new Error(updateError);

      if (updatedClient) {
        setClient(updatedClient);
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

          {pendingInstallation && (
            <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">
                    App Installation Request
                  </h3>
                  <p className="text-blue-700 mb-4">
                    This client is requesting to install the Taghunter Creator app.
                    Please confirm the installation to proceed.
                  </p>
                </div>
                <button
                  onClick={handleConfirmInstallation}
                  disabled={confirming}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>{confirming ? 'Confirming...' : 'Confirm Installation'}</span>
                </button>
              </div>
            </div>
          )}

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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-slate-700" />
              <h3 className="text-xl font-bold text-slate-900">Scenarios</h3>
            </div>
            <span className="text-sm text-slate-600">
              {scenarios.length} {scenarios.length === 1 ? 'scenario' : 'scenarios'}
            </span>
          </div>

          {loadingScenarios ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">No scenarios yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Scenarios created by this client will appear here
              </p>
            </div>
          ) : (
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
                          <span className="font-medium text-slate-700">Type:</span>{' '}
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
          )}
        </div>
      </div>
    </div>
  );
}
