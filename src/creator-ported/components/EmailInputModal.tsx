import { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface EmailInputModalProps {
  isOpen: boolean;
  onSubmit: (email: string) => void;
}

export function EmailInputModal({ isOpen, onSubmit }: EmailInputModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/check_email.php?email=${encodeURIComponent(email)}`
      );

      if (!response.ok) {
        console.error('Failed to check email:', response.statusText);
        return false;
      }

      const data = await response.json();
      return data.data?.exists === true || data.exists === true;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
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

    const emailExists = await checkEmailExists(email.trim());

    setIsValidating(false);

    if (!emailExists) {
      setError('This email is not registered. Please contact support.');
      return;
    }

    onSubmit(email.trim());
    setEmail('');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md p-6 relative border border-slate-700">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to Taghunter Playground</h2>
          <p className="text-slate-300">Please enter your email address to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your.email@example.com"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isValidating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Validating...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
