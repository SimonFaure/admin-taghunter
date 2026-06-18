import { useEffect, useState } from 'react';
import { RefreshCw, FlaskConical, Monitor } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ENDPOINT = `${API_BASE_URL}/game_types.php`;

// Tri-state override: 1 = force-on, 0 = force-off, null = inherit the next tier.
type Tri = 0 | 1 | null;

interface GameType {
  code: string;
  name: string;
  enabled: boolean; // global default
}

interface Tester {
  device_id: number;
  label: string;
  client_id: number;
  client_name: string;
  client_channel: string | null;
  device_channel: string | null;
  last_seen_at: string | null;
  overrides: Record<string, 0 | 1>;
}

interface TestersPayload {
  game_types: GameType[];
  channel_overrides: Record<string, 0 | 1>;
  client_overrides: Record<string, Record<string, 0 | 1>>;
  testers: Tester[];
}

function triOf(map: Record<string, 0 | 1> | undefined, code: string): Tri {
  if (!map || !(code in map)) return null;
  return map[code];
}

// "inherit" | "on" | "off" <-> Tri
function triToSelect(t: Tri): string {
  return t === 1 ? 'on' : t === 0 ? 'off' : 'inherit';
}
function selectToTri(v: string): Tri {
  return v === 'on' ? 1 : v === 'off' ? 0 : null;
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

function TriSelect({
  value,
  onChange,
  disabled,
  effective,
}: {
  value: Tri;
  onChange: (t: Tri) => void;
  disabled?: boolean;
  effective: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={triToSelect(value)}
        disabled={disabled}
        onChange={(e) => onChange(selectToTri(e.target.value))}
        className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
      >
        <option value="inherit">Inherit</option>
        <option value="on">Enabled</option>
        <option value="off">Disabled</option>
      </select>
      <span
        title={effective ? 'Effective: enabled' : 'Effective: disabled'}
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
          effective ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      />
    </div>
  );
}

export function TestersView() {
  const [data, setData] = useState<TestersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${ENDPOINT}?action=admin_list_testers`);
      if (!res.ok) throw new Error('Failed to load testers');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load testers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const post = async (action: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `${action} failed`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  const setChannel = (code: string, t: Tri) =>
    post('admin_set_channel_enabled', { channel: 'test', code, enabled: t });
  const setDevice = (deviceId: number, code: string, t: Tri) =>
    post('admin_set_device_enabled', { device_id: deviceId, code, enabled: t });

  // Effective availability for the "all testers" channel layer: channel override
  // (when set) else the global default.
  const channelEffective = (gt: GameType): boolean => {
    const t = triOf(data?.channel_overrides, gt.code);
    return t === null ? gt.enabled : t === 1;
  };

  // Effective availability for one device AND which tier decided it:
  // device ?? client ?? all-testers (test channel) ?? global. The source lets the
  // table explain a grey "Inherit" cell (e.g. a per-client force-off blocking an
  // all-testers grant) instead of looking broken.
  type Source = 'device' | 'client' | 'all-testers' | 'global';
  const deviceResolution = (tester: Tester, gt: GameType): { enabled: boolean; source: Source } => {
    const d = triOf(tester.overrides, gt.code);
    if (d !== null) return { enabled: d === 1, source: 'device' };
    const c = triOf(data?.client_overrides?.[tester.client_id], gt.code);
    if (c !== null) return { enabled: c === 1, source: 'client' };
    const ch = triOf(data?.channel_overrides, gt.code);
    if (ch !== null) return { enabled: ch === 1, source: 'all-testers' };
    return { enabled: gt.enabled, source: 'global' };
  };
  const SOURCE_LABEL: Record<Source, string> = {
    device: 'device',
    client: 'client',
    'all-testers': 'all testers',
    global: 'global',
  };

  const types = data?.game_types ?? [];
  const testers = data?.testers ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600 max-w-2xl">
          Devices on the <span className="font-medium">test</span> update channel. Enable a game
          type for <span className="font-medium">all testers</span> (the test channel) or override
          it per device. Resolution: device → client → all-testers → global default.
        </p>
        <button
          onClick={fetchData}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm font-medium">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : (
        <>
          {/* All testers (test channel) */}
          <div className="bg-white rounded-xl border border-amber-200 p-5 mb-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-1">
              <FlaskConical className="w-4 h-4 text-amber-500" />
              All testers (test channel)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Applies to every current and future device on the test channel, unless a device
              overrides it below.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {types.map((gt) => (
                <div key={gt.code} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 text-sm">{gt.name}</span>
                    <span className="text-[11px] text-slate-400">
                      global {gt.enabled ? 'on' : 'off'}
                    </span>
                  </div>
                  <TriSelect
                    value={triOf(data?.channel_overrides, gt.code)}
                    onChange={(t) => void setChannel(gt.code, t)}
                    disabled={busy}
                    effective={channelEffective(gt)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Per-device */}
          {testers.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
              <Monitor className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">No tester devices.</p>
              <p className="text-sm text-slate-400 mt-1">
                Set a client (or a specific device) to the Test update channel to see it here.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Tester device</th>
                    {types.map((gt) => (
                      <th key={gt.code} className="text-left px-4 py-3 font-medium">
                        {gt.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {testers.map((tester) => (
                    <tr key={tester.device_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{tester.label}</div>
                        <div className="text-xs text-slate-500">{tester.client_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {tester.device_channel === 'test'
                            ? 'device-level tester'
                            : 'via client channel'}{' '}
                          · seen {formatRelative(tester.last_seen_at)}
                        </div>
                      </td>
                      {types.map((gt) => {
                        const r = deviceResolution(tester, gt);
                        return (
                          <td key={gt.code} className="px-4 py-3 align-top">
                            <TriSelect
                              value={triOf(tester.overrides, gt.code)}
                              onChange={(t) => void setDevice(tester.device_id, gt.code, t)}
                              disabled={busy}
                              effective={r.enabled}
                            />
                            {r.source !== 'device' && (
                              <div
                                className={`mt-1 text-[11px] ${
                                  r.enabled ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                                title={`Inheriting from the ${SOURCE_LABEL[r.source]} setting`}
                              >
                                {SOURCE_LABEL[r.source]}: {r.enabled ? 'on' : 'off'}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
