import { useEffect, useMemo, useState } from 'react';
import {
  Monitor,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  Activity,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MAX_DISPLAY_NAME = 120;

interface DeviceRow {
  id: number;
  device_uniq: string;
  device_label: string | null;
  display_name: string | null;
  os: string | null;
  os_version: string | null;
  app_version: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  client_id: number | null;
  client_email: string | null;
  client_name: string | null;
  error_count_7d: number;
}

// The name shown to humans: the user/admin-chosen display_name wins, falling
// back to the OS hostname (device_label) the playground keeps fresh.
function deviceName(d: { display_name: string | null; device_label: string | null }): string {
  return d.display_name || d.device_label || '';
}

function clientName(d: DeviceRow): string {
  return d.client_name || d.client_email || (d.client_id != null ? `#${d.client_id}` : '');
}

type SortKey = 'device' | 'client' | 'last_seen' | 'errors';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

interface DeviceErrorGroup {
  fingerprint_hash: string;
  error_message: string;
  stack_trace: string | null;
  total_count: number;
  first_seen_at: string;
  last_seen_at: string;
  app_version: string | null;
}

interface DeviceLaunch {
  id: number;
  scenario_uniqid: string | null;
  duration_seconds: number | null;
  teams_count: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface DeviceDetailPayload {
  device: DeviceRow & { cards_file_version?: number };
  errors: DeviceErrorGroup[];
  launches: DeviceLaunch[];
}

async function renameDeviceAdmin(deviceId: number, displayName: string | null): Promise<void> {
  const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=rename_device`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, display_name: displayName }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Failed to rename device');
  }
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

export function DevicesView() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'last_seen', dir: 'desc' });

  const sortedDevices = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const rows = [...devices];
    rows.sort((a, b) => {
      switch (sort.key) {
        case 'device':
          return deviceName(a).localeCompare(deviceName(b)) * dir;
        case 'client':
          return clientName(a).localeCompare(clientName(b)) * dir;
        case 'errors':
          return (a.error_count_7d - b.error_count_7d) * dir;
        case 'last_seen':
        default: {
          const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
          const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
          return (ta - tb) * dir;
        }
      }
    });
    return rows;
  }, [devices, sort]);

  // Text columns read more naturally ascending; numeric/time columns descending.
  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'device' || key === 'client' ? 'asc' : 'desc' }
    );
  };

  const applyRename = (id: number, displayName: string | null) => {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, display_name: displayName } : d)));
  };

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=list_devices`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch devices');
      const json = await res.json();
      setDevices(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDevices();
  }, []);

  if (selectedId !== null) {
    return (
      <DeviceDetail
        deviceId={selectedId}
        onBack={() => setSelectedId(null)}
        onRenamed={applyRename}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">
          {devices.length} device{devices.length === 1 ? '' : 's'}, sorted by most-recent activity.
        </p>
        <button
          onClick={fetchDevices}
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
      ) : devices.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <Monitor className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No devices have reported in yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortHeader label="Device" sortKey="device" sort={sort} onSort={toggleSort} />
                <SortHeader label="Client" sortKey="client" sort={sort} onSort={toggleSort} />
                <th className="text-left px-4 py-3 font-medium">App version</th>
                <th className="text-left px-4 py-3 font-medium">OS</th>
                <SortHeader label="Last seen" sortKey="last_seen" sort={sort} onSort={toggleSort} />
                <SortHeader label="Errors (7d)" sortKey="errors" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDevices.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{deviceName(d) || '(unnamed)'}</div>
                    <div className="text-xs text-slate-400 font-mono">{d.device_uniq.slice(0, 13)}…</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{clientName(d) || '—'}</td>
                  <td className="px-4 py-3 text-sm font-mono">{d.app_version || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {d.os ? `${d.os}${d.os_version ? ' ' + d.os_version : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatRelative(d.last_seen_at)}</td>
                  <td className="px-4 py-3">
                    {d.error_count_7d > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs font-medium rounded">
                        <AlertTriangle className="w-3 h-3" />
                        {d.error_count_7d}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface DeviceDetailProps {
  deviceId: number;
  onBack: () => void;
  onRenamed: (id: number, displayName: string | null) => void;
}

function DeviceDetail({ deviceId, onBack, onRenamed }: DeviceDetailProps) {
  const [data, setData] = useState<DeviceDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'info' | 'errors' | 'launches'>('info');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    if (!data) return;
    setDraft(data.device.display_name ?? data.device.device_label ?? '');
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const saveEdit = async () => {
    if (!data) return;
    const trimmed = draft.trim();
    if (trimmed.length > MAX_DISPLAY_NAME) {
      setError(`Name must be ${MAX_DISPLAY_NAME} characters or fewer`);
      return;
    }
    const next = trimmed === '' ? null : trimmed;
    setSaving(true);
    setError('');
    try {
      await renameDeviceAdmin(data.device.id, next);
      setData((prev) => (prev ? { ...prev, device: { ...prev.device, display_name: next } } : prev));
      onRenamed(data.device.id, next);
      setEditing(false);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename device');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await authFetch(
          `${API_BASE_URL}/telemetry_admin.php?action=device_detail&device_id=${deviceId}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load device');
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load device');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 mb-6 text-sm text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to all devices
      </button>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : (
        <>
          <div className="bg-white p-6 rounded-xl border border-slate-200 mb-6">
            <div className="flex items-start justify-between">
              <div>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      maxLength={MAX_DISPLAY_NAME + 1}
                      placeholder={data.device.device_label ?? 'Device name'}
                      className="border border-slate-300 rounded px-2 py-1 text-lg font-bold text-slate-900 w-64"
                    />
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={saving}
                      title="Save"
                      className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      title="Cancel"
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h3 className="text-xl font-bold text-slate-900">
                      {deviceName(data.device) || '(unnamed device)'}
                    </h3>
                    <button
                      type="button"
                      onClick={startEdit}
                      title="Rename device"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-opacity"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400 font-mono mt-1">{data.device.device_uniq}</p>
                <p className="text-sm text-slate-500 mt-2">
                  {data.device.client_name || data.device.client_email || '—'}
                </p>
              </div>
              <div className="text-right text-sm">
                <div className="flex items-center gap-1 text-slate-500 justify-end">
                  <Calendar className="w-3 h-3" />
                  Last seen {formatRelative(data.device.last_seen_at)}
                </div>
                <div className="text-xs text-slate-400 mt-1">v{data.device.app_version || '—'}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4 border-b border-slate-200">
            <TabButton current={tab} value="info" onClick={() => setTab('info')}>
              Info
            </TabButton>
            <TabButton current={tab} value="errors" onClick={() => setTab('errors')}>
              Errors ({data.errors.length})
            </TabButton>
            <TabButton current={tab} value="launches" onClick={() => setTab('launches')}>
              Games launched ({data.launches.length})
            </TabButton>
          </div>

          {tab === 'info' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <Detail label="Display name" value={data.device.display_name} />
                <Detail label="Device label (OS hostname)" value={data.device.device_label} />
                <Detail label="Device UUID" value={data.device.device_uniq} mono />
                <Detail label="OS" value={data.device.os} />
                <Detail label="OS version" value={data.device.os_version} />
                <Detail label="App version" value={data.device.app_version} mono />
                <Detail label="Cards file version" value={String(data.device.cards_file_version ?? '—')} />
                <Detail label="Client" value={data.device.client_name || data.device.client_email} />
                <Detail label="Last seen" value={data.device.last_seen_at} />
                <Detail label="First registered" value={data.device.created_at} />
              </dl>
            </div>
          )}

          {tab === 'errors' && (
            <ErrorList errors={data.errors} />
          )}

          {tab === 'launches' && (
            <LaunchList launches={data.launches} />
          )}
        </>
      )}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="text-left px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 uppercase transition-colors ${
          active ? 'text-slate-900' : 'hover:text-slate-700'
        }`}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50" />
        )}
      </button>
    </th>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-400">{label}</dt>
      <dd className={`text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: string;
  value: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function ErrorList({ errors }: { errors: DeviceErrorGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  if (errors.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
        <Activity className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">No errors recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errors.map((e) => {
        const open = expanded.has(e.fingerprint_hash);
        return (
          <div key={e.fingerprint_hash} className="bg-white rounded-xl border border-slate-200">
            <button
              onClick={() => toggle(e.fingerprint_hash)}
              className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{e.error_message}</p>
                  <p className="text-xs text-slate-400 mt-1 font-mono">{e.fingerprint_hash.slice(0, 16)}…</p>
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <div className="font-semibold text-slate-700">×{e.total_count}</div>
                  <div>{formatRelative(e.last_seen_at)}</div>
                </div>
              </div>
            </button>
            {open && e.stack_trace && (
              <div className="px-5 pb-4 border-t border-slate-100">
                <pre className="text-xs text-slate-700 bg-slate-50 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all mt-3">
                  {e.stack_trace}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LaunchList({ launches }: { launches: DeviceLaunch[] }) {
  if (launches.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
        <p className="text-slate-500">No game launches recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Scenario</th>
            <th className="text-left px-4 py-3 font-medium">Teams</th>
            <th className="text-left px-4 py-3 font-medium">Duration</th>
            <th className="text-left px-4 py-3 font-medium">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {launches.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3 text-sm font-mono">{l.scenario_uniqid || '—'}</td>
              <td className="px-4 py-3 text-sm">{l.teams_count ?? '—'}</td>
              <td className="px-4 py-3 text-sm">{l.duration_seconds != null ? `${l.duration_seconds}s` : '—'}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{formatRelative(l.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
