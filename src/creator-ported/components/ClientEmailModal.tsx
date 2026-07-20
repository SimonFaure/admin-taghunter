// @ts-nocheck - ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState } from 'react';
import { X } from 'lucide-react';
import { ClientSelector } from './ClientSelector';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface ClientEmailModalProps {
  isOpen: boolean;
  onSubmit: (email: string, clientId: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export function ClientEmailModal({
  isOpen,
  onSubmit,
  onCancel,
  title = 'Publish Content',
  description = 'Enter the client email address to publish this content under'
}: ClientEmailModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validatedClientId, setValidatedClientId] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const checkEmailExists = async (email: string): Promise<{ exists: boolean; clientId?: string }> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/check_email.php?email=${encodeURIComponent(email)}`
      );

      if (!response.ok) {
        console.error('Failed to check email:', response.statusText);
        return { exists: false };
      }

      const data = await response.json();
      const exists = data.data?.exists === true || data.exists === true;
      const clientId =
        data.data?.client_id ?? data.client_id ?? data.data?.admin_id ?? data.admin_id;

      return { exists, clientId: clientId != null ? String(clientId) : undefined };
    } catch (error) {
      console.error('Error checking email:', error);
      return { exists: false };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsValidating(true);
    setError('');

    const result = await checkEmailExists(email.trim());

    setIsValidating(false);

    if (!result.exists) {
      setError('This email is not registered. Please contact support.');
      return;
    }

    if (!result.clientId) {
      setError('Failed to retrieve client information. Please try again.');
      return;
    }

    setValidatedClientId(result.clientId);
    onSubmit(email.trim(), result.clientId);
    setEmail('');
    setError('');
    setValidatedClientId(null);
  };

  const handleCancel = () => {
    setEmail('');
    setError('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md p-6 relative border border-slate-700">
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-slate-300">{description}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <ClientSelector
              value={email}
              onChange={(newEmail) => {
                setEmail(newEmail);
                setError('');
              }}
              label="Client Email Address"
              placeholder="client@example.com"
              required
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isValidating}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? 'Validating...' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
