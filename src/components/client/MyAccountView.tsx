import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Mail, User, Building, Calendar, Crown, CheckCircle, XCircle, Upload } from 'lucide-react';
import { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

function formatMemberSince(dateString?: string): string {
  if (!dateString) return 'N/A';

  const createdDate = new Date(dateString);
  const now = new Date();

  const diffMs = now.getTime() - createdDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  const days = Math.floor((diffDays % 365) % 30);

  let duration = '';
  if (years > 0) {
    duration = `${years} year${years > 1 ? 's' : ''}`;
    if (months > 0) {
      duration += `, ${months} month${months > 1 ? 's' : ''}`;
    }
  } else if (months > 0) {
    duration = `${months} month${months > 1 ? 's' : ''}`;
    if (days > 0) {
      duration += `, ${days} day${days > 1 ? 's' : ''}`;
    }
  } else {
    duration = `${days} day${days > 1 ? 's' : ''}`;
  }

  const formattedDate = createdDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `${formattedDate} (${duration})`;
}

export function MyAccountView() {
  const { user, updateUserAvatar } = useSecureAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${API_BASE_URL}/secure_auth.php?action=upload-avatar`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': user?.token || '',
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to upload avatar');
      }

      if (result.data?.avatar_url) {
        updateUserAvatar(result.data.avatar_url);
        setSuccess('Avatar updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-start space-x-6 mb-8">
          <div className="flex-shrink-0">
            <div className="relative">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || 'Your avatar'}
                  className="w-24 h-24 rounded-full object-cover border-4 border-slate-100"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center border-4 border-slate-100">
                  <User className="w-12 h-12 text-slate-400" />
                </div>
              )}
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 cursor-pointer transition-all shadow-lg"
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  <Upload className="w-4 h-4" />
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
            <h3 className="text-lg font-bold text-slate-900 mb-2">Account Information</h3>
            <p className="text-sm text-slate-600">Manage your profile and account settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">Name</p>
              <p className="text-base text-slate-900 truncate">{user?.name || 'Not set'}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <Mail className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">Email</p>
              <p className="text-base text-slate-900 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Building className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">Client ID</p>
              <p className="text-base text-slate-900 font-mono truncate">{user?.client_id}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${user?.license_type === 'premium' ? 'bg-purple-100' : 'bg-sky-100'}`}>
              <Crown className={`w-5 h-5 ${user?.license_type === 'premium' ? 'text-purple-600' : 'text-sky-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">License Type</p>
              <p className={`text-base font-semibold ${user?.license_type === 'premium' ? 'text-purple-600' : 'text-sky-600'}`}>
                {user?.license_type === 'premium' ? 'Premium' : 'Access'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${user?.billing_up_to_date ? 'bg-green-100' : 'bg-red-100'}`}>
              {user?.billing_up_to_date ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">Payment Status</p>
              <p className={`text-base font-semibold ${user?.billing_up_to_date ? 'text-green-600' : 'text-red-600'}`}>
                {user?.billing_up_to_date ? 'Up to Date' : 'Payment Required'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-100 rounded-lg">
              <Calendar className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600">Member Since</p>
              <p className="text-base text-slate-900">{formatMemberSince(user?.created_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Security</h3>
        <p className="text-sm text-slate-600 mb-4">
          Your account is secured with one-time password authentication.
        </p>
        <button className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
          Update Security Settings
        </button>
      </div>
    </div>
  );
}
