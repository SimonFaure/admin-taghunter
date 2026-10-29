import { useEffect, useRef, useState } from 'react';
import {
  Rocket,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  Smartphone,
  X,
  Puzzle,
  Download,
  GitBranch,
} from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ENDPOINT = `${API_BASE_URL}/playground_releases_admin.php`;

interface Release {
  id: number;
  version: string;
  channel: string;
  // The git branch the build came from (picked at upload). Null on older rows.
  git_branch: string | null;
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
  // False when the row's file is gone from the server (downloads 404); null for store links.
  file_exists: boolean | null;
}

const DESKTOP_TARGETS = ['windows', 'darwin', 'linux'];
// Updater bundles accepted per target (mirrors DESKTOP_EXTENSIONS server-side).
const DESKTOP_ACCEPT: Record<string, string> = {
  windows: '.exe,.msi,.zip',
  darwin: '.gz',
  linux: '.AppImage,.gz,.deb,.rpm',
};
const ARCHS = ['x86_64', 'aarch64', 'universal'];
const CHANNELS = ['stable', 'test'];
const SEMVER = /^\d+\.\d+\.\d+$/;
// Mirrors parseGitBranch() server-side.
const GIT_BRANCH = /^(?![/-])(?!.*\.\.)(?!.*\/$)[A-Za-z0-9._/-]{1,100}$/;

// Branches offered in the upload forms: those already used by a release, most
// recent first, plus "main". Any other name can still be typed.
function knownBranches(releases: Release[]): string[] {
  const seen = new Set<string>();
  for (const r of releases) if (r.git_branch) seen.add(r.git_branch);
  seen.add('main');
  return [...seen];
}

// Pull a semver out of an artifact filename, e.g.
// "Tag Hunter Playground_1.1.22_x64-setup" -> "1.1.22". Returns null if none.
function versionFromFilename(filename: string): string | null {
  const m = filename.match(/\d+\.\d+\.\d+/);
  return m ? m[0] : null;
}

// The arch a build's filename names ("…_x64-setup" -> "x86_64"), or null.
function archFromFilename(filename: string): string | null {
  const n = filename.toLowerCase();
  const token = (alts: string) => new RegExp(`(?<![a-z0-9])(${alts})(?![a-z0-9])`).test(n);
  if (token('x64|x86_64|amd64')) return 'x86_64';
  if (token('arm64|aarch64')) return 'aarch64';
  if (token('universal')) return 'universal';
  return null;
}

// The artifact name a Tauri .sig was made for: the file is base64 of a minisign
// signature whose trusted comment reads "timestamp:<n>\tfile:<name>".
async function signedFileName(sig: File): Promise<string | null> {
  try {
    const text = atob((await sig.text()).trim());
    const m = text.match(/trusted comment: .*?(?:^|\t)file:([^\t\r\n]+)/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

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
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Download a stored file through the admin endpoint (it needs the admin token,
 * so authFetch + a blob rather than a plain link).
 */
async function downloadArtifact(action: string, id: number, filename: string): Promise<void> {
  const res = await authFetch(`${ENDPOINT}?action=${action}&id=${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Download failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReleasesView() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'stable' | 'test'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [androidVisible, setAndroidVisible] = useState(false);
  const branches = knownBranches(releases);

  const visibleReleases =
    channelFilter === 'all'
      ? releases
      : releases.filter((r) => (r.channel || 'stable') === channelFilter);

  // Selection only ever covers rows currently on screen: switching the channel
  // filter drops anything now hidden, so "delete selected" can't remove a row the
  // admin can no longer see.
  const visibleIds = visibleReleases.map((r) => r.id);
  const selected = selectedIds.filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selected.length === visibleIds.length;
  const selectedReleases = visibleReleases.filter((r) => selected.includes(r.id));

  const toggleOne = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleAllVisible = () => setSelectedIds(allVisibleSelected ? [] : visibleIds);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${ENDPOINT}?action=list`);
      if (!res.ok) throw new Error('Failed to fetch releases');
      const json = await res.json();
      setReleases(json.releases || []);
      setAndroidVisible(!!json.android_visible_to_clients);
      setSelectedIds([]);
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
  const toggleAndroidVisible = (visible: boolean) =>
    postAction('set_android_visible', { visible });

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

  const moveChannel = (rel: Release) => {
    const from = rel.channel || 'stable';
    const to = from === 'test' ? 'stable' : 'test';
    const latestNote = rel.is_latest
      ? `\n\nIt is the current latest ${from} build: the next-newest ${from} build for ` +
        `${rel.target}/${rel.arch} will be promoted to latest.`
      : '';
    if (
      !window.confirm(
        `Move release ${rel.version} (${rel.target}/${rel.arch}) from ${from} to ${to}?\n\n` +
          `It becomes the latest ${to} build if it is newer than the current one.${latestNote}`,
      )
    )
      return;
    void postAction('set_channel', { id: rel.id, channel: to });
  };

  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const download = async (rel: Release) => {
    if (!rel.artifact_filename) return;
    setDownloadingId(rel.id);
    setError('');
    try {
      await downloadArtifact('download', rel.id, rel.artifact_filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const editBranch = (rel: Release) => {
    const next = window.prompt(
      `Git branch of release ${rel.version} (${rel.target}/${rel.arch}). Leave empty to clear.`,
      rel.git_branch || '',
    );
    if (next === null) return;
    if (next.trim() && !GIT_BRANCH.test(next.trim())) {
      setError(`"${next.trim()}" is not a valid git branch name`);
      return;
    }
    void postAction('update_branch', { id: rel.id, git_branch: next.trim() });
  };

  const editNotes = (rel: Release) => {
    const next = window.prompt(`Release notes for ${rel.version}`, rel.notes || '');
    if (next === null) return;
    void postAction('update_notes', { id: rel.id, notes: next });
  };

  const remove = (rel: Release) => {
    const latestWarning = rel.is_latest
      ? '\n\nThis is the current latest release: the next-newest build for ' +
        `${rel.target}/${rel.arch} will be promoted to latest, or no release ` +
        'will be latest if this is the only one.'
      : '';
    if (
      !window.confirm(
        `Are you sure you want to delete release ${rel.version} (${rel.target}/${rel.arch})? ` +
          `This action cannot be undone.${latestWarning}`,
      )
    )
      return;
    void postAction('delete', { id: rel.id });
  };

  const removeSelected = () => {
    if (selected.length === 0) return;
    const latestCount = selectedReleases.filter((r) => r.is_latest).length;
    const preview = selectedReleases
      .slice(0, 10)
      .map((r) => `  • ${r.version} (${r.channel || 'stable'} — ${r.target}/${r.arch})`)
      .join('\n');
    const more =
      selectedReleases.length > 10 ? `\n  … and ${selectedReleases.length - 10} more` : '';
    const latestWarning = latestCount
      ? `\n\n${latestCount} of them ${latestCount === 1 ? 'is' : 'are'} the current latest ` +
        'release for their platform: the next-newest remaining build will be promoted ' +
        'to latest, or no release will be latest if none remains.'
      : '';
    if (
      !window.confirm(
        `Delete ${selected.length} release${selected.length === 1 ? '' : 's'}?\n\n` +
          `${preview}${more}\n\nThis action cannot be undone.${latestWarning}`,
      )
    )
      return;
    void postAction('delete_bulk', { ids: selected });
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
        <NewDesktopRelease onDone={fetchReleases} onError={setError} branches={branches} />
        <NewAndroidRelease
          onDone={fetchReleases}
          onError={setError}
          branches={branches}
          visibleToClients={androidVisible}
          onToggleVisible={toggleAndroidVisible}
          toggleBusy={busy || loading}
        />
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
          {selected.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-900 text-white text-sm">
              <span>
                {selected.length} release{selected.length === 1 ? '' : 's'} selected
                {selectedReleases.some((r) => r.is_latest) && (
                  <span className="ml-2 text-amber-300">
                    (includes {selectedReleases.filter((r) => r.is_latest).length} latest)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1 rounded border border-white/30 hover:bg-white/10 transition-colors"
                >
                  Clear
                </button>
                <button
                  disabled={busy}
                  onClick={removeSelected}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {busy ? 'Deleting…' : `Delete ${selected.length}`}
                </button>
              </div>
            </div>
          )}
          <table className="w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all releases"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.length > 0 && !allVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    className="w-4 h-4 accent-slate-900 cursor-pointer align-middle"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium">Version</th>
                <th className="text-left px-4 py-3 font-medium">Channel</th>
                <th className="text-left px-4 py-3 font-medium">Branch</th>
                <th className="text-left px-4 py-3 font-medium">Platform</th>
                <th className="text-left px-4 py-3 font-medium">Artifact</th>
                <th className="text-left px-4 py-3 font-medium">Floor</th>
                <th className="text-left px-4 py-3 font-medium">Published</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleReleases.map((r) => (
                <tr
                  key={r.id}
                  className={`transition-colors ${
                    selected.includes(r.id) ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select release ${r.version} (${r.target}/${r.arch})`}
                      checked={selected.includes(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="w-4 h-4 accent-slate-900 cursor-pointer align-middle"
                    />
                  </td>
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
                  <td className="px-4 py-3">
                    <button
                      disabled={busy}
                      onClick={() => editBranch(r)}
                      title="Change the git branch of this release"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border hover:bg-slate-100 disabled:opacity-50 max-w-[12rem] ${
                        r.git_branch
                          ? 'font-mono text-slate-700 border-slate-200'
                          : 'text-slate-400 border-dashed border-slate-300'
                      }`}
                    >
                      <GitBranch className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{r.git_branch || 'set'}</span>
                    </button>
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
                    ) : r.artifact_filename && r.file_exists === false ? (
                      <span
                        title={`${r.artifact_filename} is no longer on the server, so downloads and self-update fail. Upload the same version/channel/platform again to repair this row.`}
                        className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                      >
                        file missing — re-upload
                      </span>
                    ) : r.artifact_filename ? (
                      <button
                        disabled={downloadingId === r.id}
                        onClick={() => void download(r)}
                        title={`Download ${r.artifact_filename}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloadingId === r.id ? 'Downloading…' : formatSize(r.artifact_size)}
                      </button>
                    ) : (
                      <span>-</span>
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
                        onClick={() => moveChannel(r)}
                        title="Change this release's update channel"
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        → {(r.channel || 'stable') === 'test' ? 'stable' : 'test'}
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

      <ExtensionReleases />
    </div>
  );
}

interface FormProps {
  onDone: () => void;
  onError: (msg: string) => void;
  branches: string[];
}

// Required git branch for an upload: pick a known one from the list or type a new one.
function checkBranch(branch: string): string | null {
  if (!branch.trim()) return 'Choose the git branch this build was made from';
  if (!GIT_BRANCH.test(branch.trim())) return `"${branch.trim()}" is not a valid git branch name`;
  return null;
}

function BranchField({
  id,
  value,
  onChange,
  branches,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  branches: string[];
}) {
  return (
    <Field label="Git branch">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={id}
        placeholder="main"
        autoComplete="off"
        spellCheck={false}
        className="input font-mono"
      />
      <datalist id={id}>
        {branches.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </Field>
  );
}

function NewDesktopRelease({ onDone, onError, branches }: FormProps) {
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('stable');
  const [gitBranch, setGitBranch] = useState('');
  const [target, setTarget] = useState('windows');
  const [arch, setArch] = useState('x86_64');
  const [floor, setFloor] = useState('0.0.0');
  const [notes, setNotes] = useState('');
  const [artifact, setArtifact] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  // undefined while the .sig is being read; null when it isn't a Tauri .sig.
  const [signedFor, setSignedFor] = useState<string | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Same checks as the server, shown before uploading a large installer.
  const fileVersion = artifact ? versionFromFilename(artifact.name) : null;
  const fileArch = artifact ? archFromFilename(artifact.name) : null;
  const problems: string[] = [];
  if (fileVersion && version.trim() && fileVersion !== version.trim()) {
    problems.push(`The file is version ${fileVersion} but the form says ${version.trim()}.`);
  }
  if (fileArch && fileArch !== arch) {
    problems.push(`The file is a ${fileArch} build but the form says ${arch}.`);
  }
  if (artifact && signature && signedFor === null) {
    problems.push('The signature file is not a Tauri .sig.');
  } else if (artifact && signedFor && signedFor !== artifact.name) {
    problems.push(`The .sig was made for "${signedFor}", not for this artifact.`);
  }

  const pickSignature = (f: File | null) => {
    setSignature(f);
    setSignedFor(undefined);
    if (f) void signedFileName(f).then(setSignedFor);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SEMVER.test(version.trim())) return onError('Version must be semver (x.y.z)');
    if (!SEMVER.test(floor.trim())) return onError('Floor must be semver (x.y.z)');
    const branchError = checkBranch(gitBranch);
    if (branchError) return onError(branchError);
    if (!artifact) return onError('Select the build artifact');
    if (!signature) return onError('Select the .sig signature file');
    if (problems.length) return onError(problems.join(' '));

    const fd = new FormData();
    fd.append('version', version.trim());
    fd.append('channel', channel);
    fd.append('git_branch', gitBranch.trim());
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
      pickSignature(null);
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
        <BranchField
          id="desktop-release-branches"
          value={gitBranch}
          onChange={setGitBranch}
          branches={branches}
        />
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
      <FileDrop
        label="Artifact (updater bundle)"
        file={artifact}
        accept={DESKTOP_ACCEPT[target]}
        onFile={(f) => {
          setArtifact(f);
          // Fill the version and arch from each picked file (e.g.
          // "…_1.1.22_x64-setup"), so swapping files can't keep stale values.
          if (f) {
            const detected = versionFromFilename(f.name);
            if (detected) setVersion(detected);
            const detectedArch = archFromFilename(f.name);
            if (detectedArch) setArch(detectedArch);
          }
        }}
      />
      <FileDrop label="Signature (.sig)" file={signature} accept=".sig" onFile={pickSignature} />
      {signature && signedFor && (
        <p className={`mt-1 text-xs ${artifact && signedFor !== artifact.name ? 'text-red-600' : 'text-slate-500'}`}>
          Signed for: {signedFor}
        </p>
      )}
      {problems.length > 0 && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs space-y-0.5">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
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

// Android tablets are sideloaded (no Play Store): the signed APK from
// `npm run android:release` is uploaded here and the server records its SHA-256,
// which the tablet verifies before installing. Design: project_android_operator_tablet.
function NewAndroidRelease({
  onDone,
  onError,
  branches,
  visibleToClients,
  onToggleVisible,
  toggleBusy,
}: FormProps & {
  visibleToClients: boolean;
  onToggleVisible: (visible: boolean) => void;
  toggleBusy: boolean;
}) {
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('stable');
  const [gitBranch, setGitBranch] = useState('');
  const [floor, setFloor] = useState('0.0.0');
  const [notes, setNotes] = useState('');
  const [apk, setApk] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SEMVER.test(version.trim())) return onError('Version must be semver (x.y.z)');
    if (!SEMVER.test(floor.trim())) return onError('Floor must be semver (x.y.z)');
    const branchError = checkBranch(gitBranch);
    if (branchError) return onError(branchError);
    if (!apk) return onError('Select the .apk file');

    const fd = new FormData();
    fd.append('version', version.trim());
    fd.append('channel', channel);
    fd.append('git_branch', gitBranch.trim());
    fd.append('target', 'android');
    fd.append('arch', 'universal');
    fd.append('min_supported_version', floor.trim());
    fd.append('notes', notes);
    fd.append('artifact', apk);

    setSubmitting(true);
    onError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 413
            ? json.error || 'APK too large for the server upload limit.'
            : json.error || 'Upload failed'
        );
      }
      setVersion('');
      setNotes('');
      setApk(null);
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
        New Android release (APK)
      </h3>
      {/* Licensees only see the Android release on their Releases page when this
          is on. The tablet self-update path is not affected. */}
      <label
        className={`flex items-start gap-2 mb-1 p-3 rounded-lg border text-sm cursor-pointer ${
          visibleToClients
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <input
          type="checkbox"
          checked={visibleToClients}
          disabled={toggleBusy}
          onChange={(e) => onToggleVisible(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-slate-900 cursor-pointer"
        />
        <span>
          <span className="font-medium">Show Android releases to licensees</span>
          <span className="block text-xs opacity-80">
            {visibleToClients
              ? 'The latest stable APK appears on the licensee Releases page.'
              : 'Hidden from the licensee Releases page.'}
          </span>
        </span>
      </label>
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
        <BranchField
          id="android-release-branches"
          value={gitBranch}
          onChange={setGitBranch}
          branches={branches}
        />
      </div>
      <Field label="Release notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input"
        />
      </Field>
      <FileDrop
        label="Signed APK (release-android/…apk)"
        file={apk}
        accept=".apk"
        onFile={(f) => {
          setApk(f);
          if (f && !version.trim()) {
            const detected = versionFromFilename(f.name);
            if (detected) setVersion(detected);
          }
        }}
      />
      <p className="text-xs text-slate-500 mt-1">
        Tablets install it after checking its SHA-256. First-install link:{' '}
        <span className="font-mono">{API_BASE_URL}/playground_update.php?action=android</span>
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? 'Uploading…' : 'Publish Android release'}
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

interface ExtensionRelease {
  id: number;
  name: string;
  version: string;
  artifact_filename: string;
  artifact_size: number;
  artifact_sha256: string;
  notes: string | null;
  created_at: string;
}

// Claude Desktop extensions (.mcpb) - admin only. taghunter-playground.mcpb runs
// game-simulator campaigns from Claude Desktop on a tester PC (playground repo,
// tools/playground-mcp). Stored apart from playground_releases: licensees never
// see them, and the download needs the admin token.
function ExtensionReleases() {
  const [items, setItems] = useState<ExtensionRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${ENDPOINT}?action=extension_list`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load the extensions');
      setItems(json.extensions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the extensions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Select the .mcpb file');
    if (version.trim() && !SEMVER.test(version.trim())) return setError('Version must be semver (x.y.z)');
    const fd = new FormData();
    fd.append('artifact', file);
    if (version.trim()) fd.append('version', version.trim());
    fd.append('notes', notes);
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=extension_upload`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setFile(null);
      setVersion('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const download = async (ext: ExtensionRelease) => {
    setBusyId(ext.id);
    setError('');
    try {
      await downloadArtifact('extension_download', ext.id, ext.artifact_filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ext: ExtensionRelease) => {
    if (!window.confirm(`Delete ${ext.name} ${ext.version}? This action cannot be undone.`)) return;
    setBusyId(ext.id);
    setError('');
    try {
      const res = await authFetch(`${ENDPOINT}?action=extension_delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ext.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 mb-1">
        <Puzzle className="w-5 h-5 text-slate-700" />
        <h2 className="text-base font-bold text-slate-900">Claude Desktop extensions</h2>
        <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-900 text-white">admin only</span>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        <span className="font-mono">.mcpb</span> bundles for testers, e.g.{' '}
        <span className="font-mono">taghunter-playground.mcpb</span> (“Launch the Playground simulations”). Never shown
        to licensees. Install: Claude Desktop → Settings → Extensions, then drop the file there.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={upload} className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-1">
            <Upload className="w-4 h-4" />
            Upload an extension
          </h3>
          <p className="text-xs text-slate-500">
            Built with <span className="font-mono">npm run pack</span> in{' '}
            <span className="font-mono">taghunter_playground/tools/playground-mcp</span>. Name and version are read
            from the bundle; uploading the same version again replaces it.
          </p>
          <FileDrop label="Extension (.mcpb)" file={file} accept=".mcpb" onFile={setFile} />
          <Field label="Version (optional, overrides the manifest)">
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" className="input" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Uploading…' : 'Upload extension'}
          </button>
          <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:.5rem;padding:.4rem .6rem;font-size:.875rem;margin-top:.15rem}`}</style>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No extension uploaded yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((ext, i) => (
                <li key={ext.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{ext.name}</span>
                      <span className="font-mono text-sm">{ext.version}</span>
                      {items.findIndex((x) => x.name === ext.name) === i && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded">
                          <Star className="w-3 h-3" />
                          latest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ext.artifact_filename} · {formatSize(ext.artifact_size)} · {formatDate(ext.created_at)}
                    </div>
                    {ext.notes && <div className="text-xs text-slate-600 mt-1">{ext.notes}</div>}
                    <div className="text-[10px] text-slate-400 font-mono mt-1 truncate" title={ext.artifact_sha256}>
                      sha256 {ext.artifact_sha256}
                    </div>
                  </div>
                  <button
                    disabled={busyId === ext.id}
                    onClick={() => void download(ext)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                  <button
                    disabled={busyId === ext.id}
                    onClick={() => void remove(ext)}
                    title="Delete"
                    className="p-1 text-red-600 rounded hover:bg-red-50 disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
