import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Eye, EyeOff, Wifi, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getClientHotspot, updateClientHotspot, wifiQrPayload, ClientHotspot } from '../lib/devicesApi';

interface ClientHotspotPanelProps {
  clientId: number;
}

// Per-client studio-authored Wi-Fi hotspot, edited inline on the client detail
// page. Studio is the SOLE author: the playground pulls these creds on sync and
// raises this network when a device becomes the mother - it never generates its
// own. Editing bumps the version; the change applies at the next fresh mother
// start (after devices re-sync online), never mid-game. The server seeds a row
// on first view, so this always shows creds even for older clients.
//
// SSID/password rules mirror the playground hotspot manager (hotspot.rs): SSID
// 1-32 chars, password 8-63 chars, neither may contain ; , " : \.
const FORBIDDEN = /[;,":\\]/;

export function ClientHotspotPanel({ clientId }: ClientHotspotPanelProps) {
  const [hotspot, setHotspot] = useState<ClientHotspot | null>(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const fetchHotspot = async () => {
    setLoading(true);
    setError(null);
    try {
      const hs = await getClientHotspot(clientId);
      setHotspot(hs);
      setSsid(hs?.ssid ?? '');
      setPassword(hs?.password ?? '');
    } catch {
      setError('Failed to load hotspot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHotspot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const validate = (): string | null => {
    if (ssid.length < 1 || ssid.length > 32) return 'SSID must be 1-32 characters';
    if (FORBIDDEN.test(ssid)) return 'SSID must not contain ; , " : \\';
    if (password.length < 8 || password.length > 63) return 'Password must be 8-63 characters';
    if (FORBIDDEN.test(password)) return 'Password must not contain ; , " : \\';
    return null;
  };

  const persist = async (opts: { regenerate?: boolean } = {}) => {
    const err = opts.regenerate ? null : validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateClientHotspot({
        clientId,
        ssid: ssid.trim(),
        password: opts.regenerate ? undefined : password,
        regeneratePassword: opts.regenerate ?? false,
      });
      setHotspot(updated);
      setSsid(updated.ssid);
      setPassword(updated.password);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save hotspot');
    } finally {
      setSaving(false);
    }
  };

  const dirty = hotspot != null && (ssid.trim() !== hotspot.ssid || password !== hotspot.password);

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">
        This client's Wi-Fi hotspot. Playground devices pull these credentials on
        sync and raise this network when a device becomes the mother. Devices on
        the same account skip pairing approval. Changes apply at the next game /
        hotspot start, <strong>after devices come online to sync</strong> - never
        mid-game.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1 space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Network name (SSID)
              </label>
              <div className="relative">
                <Wifi className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  maxLength={32}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="TagHunter-Client"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={63}
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Show or hide the password"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button
                onClick={() => persist()}
                disabled={saving || !dirty}
                className="px-4 py-2 flex items-center gap-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved' : 'Save changes'}
              </button>
              <button
                onClick={() => persist({ regenerate: true })}
                disabled={saving}
                className="px-4 py-2 flex items-center gap-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
                title="Generate a new random password"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate password
              </button>
              {hotspot && hotspot.version > 0 && (
                <span className="text-xs text-slate-400">v{hotspot.version}</span>
              )}
            </div>
          </div>

          {hotspot && (
            <div className="flex flex-col items-center gap-2">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <QRCodeSVG value={wifiQrPayload(ssid, password)} size={132} level="M" marginSize={1} />
              </div>
              <span className="text-xs text-slate-400">Scan to join</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
