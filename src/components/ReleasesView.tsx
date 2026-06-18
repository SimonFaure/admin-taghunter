import { useEffect, useRef, useState } from 'react';
import { Rocket, RefreshCw, Star, Trash2, Upload, Smartphone, X } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ENDPOINT = `${API_BASE_URL}/playground_releases_admin.php`;

interface Release {
  id: number;
  version: string;
  channel: string;
  target: string;
  arch: string;
  artifact_filename: string | null;
  artifact_size: number | null;
  store_url: string | null;
  pub_date: string;
  notes: string | null;
  min_supported_version: string;
  is_latest: boolean;
  created_at: string;
}

const DESKTOP_TARGETS = ['windows', 'darwin', 'linux'];
const ARCHS = ['x86_64', 'aarch64', 'universal'];
const CHANNELS = ['stable', 'test'];
const SEMVER = /^\d+\.\d+\.\d+$/;

// Small coloured badge for a release's channel. Stable is neutral; test is amber
// so a pre-release build is obvious at a glance in the combined list.
function ChannelBadge({ channel }: { channel: string }) {
  const isTest = channel === 'test';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
        isTest
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {channel}
    </span>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReleasesView() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'stable' | 'test'>('all');

  const visibleReleases =
    channelFilter === 'all'
      ? releases
      : releases.filter((r) => (r.channel || 'stable') === channelFilter);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${ENDPOINT}?action=list`);
      if (!res.ok) throw new Error('Failed to fetch releases');
      const json = await res.json();
      setReleases(json.releases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReleases();
  }, []);

  // POST a JSON action and refresh.
  const postAction = async (action: string, body: Record<string, unknown>) => {
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
      await fetchReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  const setLatest = (id: number) => postAction('set_latest', { id });

  const setFloor = (rel: Release) => {
    const next = window.prompt(
      `Minimum supported version for release ${rel.version} (${rel.target}/${rel.arch}).\n` +
        'Clients below this floor are hard-blocked until they update.',
      rel.min_supported_version
    );
    if (next === null) return;
    if (!SEMVER.test(next.trim())) {
      setError('Floor must be semver (x.y.z)');
      return;
    }
    void postAction('set_floor', { id: rel.id, min_supported_version: next.trim() });
  };

  const editNotes = (rel: Release) => {
    const next = window.prompt(`Release notes for ${rel.version}`, rel.notes || '');
    if (next === null) return;
    void postAction('update_notes', { id: rel.id, notes: next });
  };

  const remove = (rel: Release) => {
    const latestWarning = rel.is_latest
      ? '\n\nThis is the current LATEST release. The next-newest build for ' +
        `${rel.target}/${rel.arch} will be promoted to latest automatically ` +
        '(or no release will be latest if this is the only one).'
      : '';
    if (!window.confirm(`Delete release ${rel.version} (${rel.target}/${rel.arch})?${latestWarning}`))
      return;
    void postAction('delete', { id: rel.id });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">
          {releases.length} release{releases.length === 1 ? '' : 's'}. The “latest” row per
          channel + platform drives self-update; its minimum version is the hard floor.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-sm">
            {(['all', 'stable', 'test'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={`px-3 py-2 capitalize transition-colors ${
                  channelFilter === c
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={fetchReleases}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <NewDesktopRelease onDone={fetchReleases} onError={setError} />
        <NewMobileRelease onDone={fetchReleases} onError={setError} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : visibleReleases.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <Rocket className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">
            {releases.length === 0
              ? 'No releases published yet.'
              : `No ${channelFilter} releases.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Version</th>
                <th className="text-left px-4 py-3 font-medium">Channel</th>
                <th className="text-left px-4 py-3 font-medium">Platform</th>
                <th className="text-left px-4 py-3 font-medium">Artifact</th>
                <th className="text-left px-4 py-3 font-medium">Floor</th>
                <th className="text-left px-4 py-3 font-medium">Published</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleReleases.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-slate-900">{r.version}</span>
                      {r.is_latest && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded">
                          <Star className="w-3 h-3" />
                          latest
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelBadge channel={r.channel || 'stable'} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.target}/{r.arch}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.store_url ? (
                      <a
                        href={r.store_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        store link
                      </a>
                    ) : (
                      <span title={r.artifact_filename || ''}>
                        {formatSize(r.artifact_size)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{r.min_supported_version}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatDate(r.pub_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!r.is_latest && (
                        <button
                          disabled={busy}
                          onClick={() => setLatest(r.id)}
                          className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Set latest
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => setFloor(r)}
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Floor
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => editNotes(r)}
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Notes
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => remove(r)}
                        title={r.is_latest ? 'Delete (will promote next-newest to latest)' : 'Delete'}
                        className="p-1 text-red-600 rounded hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

interface FormProps {
  onDone: () => void;
  onError: (msg: string) => void;
}

function NewDesktopRelease({ onDone, onError }: FormProps) {
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('stable');
  const [target, setTarget] = useState('windows');
  const [arch, setArch] = useState('x86_64');
  const [floor, setFloor] = useState('0.0.0');
  const [notes, setNotes] = useState('');
  const [artifact, setArtifact] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SEMVER.test(version.trim())) return onError('Version must be semver (x.y.z)');
    if (!SEMVER.test(floor.trim())) return onError('Floor must be semver (x.y.z)');
    if (!artifact) return onError('Select the build artifact');
    if (!signature) return onError('Select the .sig signature file');

    const fd = new FormData();
    fd.append('version', version.trim());
    fd.append('channel', channel);
    fd.append('target', target);
    fd.append('arch', arch);
    fd.append('min_supported_version', floor.trim());
    fd.append('notes', notes);
    fd.append('artifact', artifact);
    fd.append('signature', signature);

    setSubmitting(true);
    onError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 413
            ? json.error || 'Artifact too large for the server upload limit.'
            : json.error || 'Upload failed'
        );
      }
      setVersion('');
      setNotes('');
      setArtifact(null);
      setSignature(null);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white p-5 rounded-xl border border-slate-200">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
        <Upload className="w-4 h-4" />
        New desktop release
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Version (x.y.z)">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.2.0"
            className="input"
          />
        </Field>
        <Field label="Min supported (floor)">
          <input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="0.0.0"
            className="input"
          />
        </Field>
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="input">
            {DESKTOP_TARGETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arch">
          <select value={arch} onChange={(e) => setArch(e.target.value)} className="input">
            {ARCHS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Release notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input"
        />
      </Field>
      <FileDrop label="Artifact (updater bundle)" file={artifact} onFile={setArtifact} />
      <FileDrop label="Signature (.sig)" file={signature} accept=".sig" onFile={setSignature} />
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? 'Uploading…' : 'Publish release'}
      </button>
      <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:.5rem;padding:.4rem .6rem;font-size:.875rem;margin-top:.15rem}`}</style>
    </form>
  );
}

function NewMobileRelease({ onDone, onError }: FormProps) {
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('stable');
  const [target, setTarget] = useState('android');
  const [storeUrl, setStoreUrl] = useState('');
  const [floor, setFloor] = useState('0.0.0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SEMVER.test(version.trim())) return onError('Version must be semver (x.y.z)');
    if (!SEMVER.test(floor.trim())) return onError('Floor must be semver (x.y.z)');
    if (!storeUrl.trim()) return onError('Store URL is required');

    setSubmitting(true);
    onError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=upload_mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: version.trim(),
          channel,
          target,
          store_url: storeUrl.trim(),
          min_supported_version: floor.trim(),
          notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setVersion('');
      setStoreUrl('');
      setNotes('');
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white p-5 rounded-xl border border-slate-200">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
        <Smartphone className="w-4 h-4" />
        New mobile release (store link)
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Version (x.y.z)">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.2.0"
            className="input"
          />
        </Field>
        <Field label="Min supported (floor)">
          <input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="0.0.0"
            className="input"
          />
        </Field>
        <Field label="Platform">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="input">
            <option value="android">android</option>
            <option value="ios">ios</option>
          </select>
        </Field>
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Store URL">
        <input
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          placeholder="https://play.google.com/store/apps/details?id=…"
          className="input"
        />
      </Field>
      <Field label="Release notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input"
        />
      </Field>
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Publish mobile release'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mt-3">
      <span className="text-xs uppercase text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// A click-or-drag file picker. Replaces the bare <input type="file"> so artifacts
// and signatures can be dropped onto the form.
function FileDrop({
  label,
  file,
  accept,
  onFile,
}: {
  label: string;
  file: File | null;
  accept?: string;
  onFile: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-3">
      <span className="text-xs uppercase text-slate-400">{label}</span>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0] ?? null;
          if (dropped) onFile(dropped);
        }}
        className={`mt-1 flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
          dragging
            ? 'border-slate-900 bg-slate-50'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <Upload className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          {file ? (
            <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
          ) : (
            <p className="text-sm text-slate-500">
              Drop file here or <span className="text-blue-600">browse</span>
            </p>
          )}
        </div>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            title="Remove file"
            className="ml-auto p-1 text-slate-400 hover:text-red-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
