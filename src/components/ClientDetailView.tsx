import { useState, useEffect } from 'react';
import { ArrowLeft, Upload, User } from 'lucide-react';
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

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    company: '',
    phone: '',
    notes: '',
    license_type: 'access' as LicenseType,
    billing_up_to_date: true,
  });

  useEffect(() => {
    loadClient();
  }, [clientId]);

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
              <div className="flex gap-3">
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
    </div>
  );
}
