import { useState } from 'react';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { secureAuth } from '../lib/secureAuth';

interface SecureLoginFormProps {
  onSuccess: (data: { client_id: string; email: string; name?: string; token: string }) => void;
}

export default function SecureLoginForm({ onSuccess }: SecureLoginFormProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const result = await secureAuth.requestCode(email, 'otp');

      if (result.error) {
        setError(result.error);
      } else {
        setSuccessMessage(result.message || 'Code sent! Check your email.');
        setStep('code');
      }
    } catch (err) {
      setError('Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await secureAuth.verifyCode(email, code);

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        onSuccess({
          client_id: result.data.client_id,
          email: result.data.email,
          name: result.data.name,
          token: result.data.token,
        });
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setSuccessMessage('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/logo_tag_hunter.png"
              alt="Tag Hunter"
              className="h-24 w-auto"
            />
          </div>
          <h2 className="text-3xl font-bold text-white">Secure Login</h2>
          <p className="mt-2 text-slate-400">
            {step === 'email'
              ? 'Enter your email to receive a login code'
              : 'Enter the code sent to your email'}
          </p>
        </div>

        <div className="bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700">
          {step === 'email' ? (
            <form onSubmit={handleRequestCode} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  'Sending...'
                ) : (
                  <>
                    Send Code
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-300 mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="code"
                    name="code"
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-10 w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    autoComplete="off"
                  />
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Code sent to: <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              {successMessage && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                  <p className="text-sm text-green-400">{successMessage}</p>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Verify & Login'}
                </button>

                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-colors"
                >
                  Back to Email
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={loading}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center text-sm text-slate-400">
          <p>Secured with token-based authentication and rate limiting</p>
        </div>
      </div>
    </div>
  );
}
