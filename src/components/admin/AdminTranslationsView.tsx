import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { SUPPORTED_LANGS } from '../../i18n/languages';
import {
  INGAME_CATALOG,
  INGAME_NAMESPACES,
  NAMESPACE_STORE_KEY,
  metaStoreKey,
  type IngameNamespace,
} from '../../i18n/ingameCatalog';
import {
  buildIngameWorkbook,
  parseIngameWorkbook,
  cellStatus,
  fnv1a,
  sourceEn,
  TARGET_LANGS,
  type NsValues,
  type NsHashes,
} from '../../i18n/translatorXlsx';
import { invalidateAdminTranslations } from '../../scenarios/preview/useAdminTranslations';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Namespaces that actually have editable keys today (mystery/tracks are empty).
const ACTIVE_NAMESPACES = INGAME_NAMESPACES.filter((ns) => INGAME_CATALOG[ns].length > 0);

type ValuesMap = Partial<Record<IngameNamespace, NsValues>>;
type HashesMap = Partial<Record<IngameNamespace, NsHashes>>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const NS_LABEL: Record<IngameNamespace, string> = {
  ingame_common: 'Common (all games)',
  ingame_tagquest: 'TagQuest',
  ingame_mystery: 'Mystery',
  ingame_tracks: 'Track',
};

/** Normalize legacy `{s}`/`{n}` tokens to i18next `{{s}}`/`{{n}}`. Idempotent. */
const normalizePlaceholders = (v: string) => v.replace(/\{\{?([sn])\}?\}/g, '{{$1}}');

/** Seed a namespace's grid from the catalog baseline, then overlay remote values. */
function seedNs(ns: IngameNamespace, remote: NsValues | undefined): NsValues {
  const out: NsValues = {};
  for (const def of INGAME_CATALOG[ns]) {
    const merged: Record<string, string> = { ...def.seed, ...(remote?.[def.key] ?? {}) };
    for (const lang of Object.keys(merged)) merged[lang] = normalizePlaceholders(merged[lang]);
    out[def.key] = merged;
  }
  return out;
}

export default function AdminTranslationsView() {
  const { user, token } = useAuth();
  const [values, setValues] = useState<ValuesMap>({});
  const [hashes, setHashes] = useState<HashesMap>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [activeNs, setActiveNs] = useState<IngameNamespace>(ACTIVE_NAMESPACES[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Snapshot of last-persisted values (per ns→key→lang) for dirty detection on save.
  const savedRef = useRef<ValuesMap>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  async function fetchConfig(meta: string): Promise<{ value: unknown; version: number } | null> {
    const res = await fetch(`${API_BASE_URL}/default_config.php?action=get&meta=${meta}`, {
      headers: authHeaders,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Load ${meta} failed (${res.status})`);
    const json = await res.json();
    return { value: json?.config?.value, version: Number(json?.config?.version) || 1 };
  }

  // Load every active namespace (values + hash companion) once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const nextValues: ValuesMap = {};
        const nextHashes: HashesMap = {};
        const nextVersions: Record<string, number> = {};
        for (const ns of ACTIVE_NAMESPACES) {
          const storeKey = NAMESPACE_STORE_KEY[ns];
          const valCfg = await fetchConfig(storeKey).catch(() => null);
          const metaCfg = await fetchConfig(metaStoreKey(storeKey)).catch(() => null);
          const remote = (valCfg?.value && typeof valCfg.value === 'object'
            ? (valCfg.value as NsValues)
            : undefined);
          nextValues[ns] = seedNs(ns, remote);
          nextHashes[ns] = (metaCfg?.value && typeof metaCfg.value === 'object'
            ? (metaCfg.value as NsHashes)
            : {});
          nextVersions[storeKey] = valCfg?.version ?? 1;
          nextVersions[metaStoreKey(storeKey)] = metaCfg?.version ?? 1;
        }
        if (!active) return;
        setValues(nextValues);
        setHashes(nextHashes);
        setVersions(nextVersions);
        savedRef.current = clone(nextValues);
      } catch (err) {
        if (active) setMessage({ type: 'error', text: (err as Error).message || 'Load failed.' });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const setCell = (ns: IngameNamespace, key: string, lang: string, text: string) => {
    setValues((prev) => ({
      ...prev,
      [ns]: { ...prev[ns], [key]: { ...prev[ns]?.[key], [lang]: text } },
    }));
  };

  async function saveConfig(meta: string, value: unknown): Promise<number> {
    const res = await fetch(`${API_BASE_URL}/default_config.php?action=create`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ user_email: user?.email, meta, version: versions[meta] ?? 1, value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Save ${meta} failed (${res.status}).`);
    return Number(json.version) || (versions[meta] ?? 1) + 1;
  }

  /**
   * Recompute the hash companion for a namespace: a target cell changed this
   * session is stamped against the current en (admin just translated it); an
   * unchanged cell keeps its stored hash (so an en-only edit leaves targets stale).
   */
  function recomputeHashes(ns: IngameNamespace): NsHashes {
    const nsVals = values[ns] ?? {};
    const saved = savedRef.current[ns] ?? {};
    const prevHashes = hashes[ns] ?? {};
    const out: NsHashes = {};
    for (const def of INGAME_CATALOG[ns]) {
      const en = sourceEn(def, nsVals);
      const enHash = fnv1a(en);
      for (const lang of TARGET_LANGS) {
        const val = nsVals[def.key]?.[lang];
        if (!val) continue;
        const changed = val !== saved[def.key]?.[lang];
        const hash = changed ? enHash : prevHashes[def.key]?.[lang];
        if (hash) (out[def.key] ??= {})[lang] = hash;
      }
    }
    return out;
  }

  const handleSave = async () => {
    if (!user?.email) {
      setMessage({ type: 'error', text: 'You must be logged in as an admin to save.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const ns = activeNs;
      const storeKey = NAMESPACE_STORE_KEY[ns];
      const nsHashes = recomputeHashes(ns);
      const valVersion = await saveConfig(storeKey, values[ns] ?? {});
      const metaVersion = await saveConfig(metaStoreKey(storeKey), nsHashes);
      setVersions((v) => ({ ...v, [storeKey]: valVersion, [metaStoreKey(storeKey)]: metaVersion }));
      setHashes((h) => ({ ...h, [ns]: nsHashes }));
      savedRef.current = { ...savedRef.current, [ns]: clone(values[ns] ?? {}) };
      invalidateAdminTranslations();
      setMessage({ type: 'success', text: `Saved ${NS_LABEL[ns]} (v${valVersion}).` });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const buf = await buildIngameWorkbook(values, hashes);
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'taghunter-ingame-translations.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    if (!user?.email) {
      setMessage({ type: 'error', text: 'You must be logged in as an admin to import.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const parsed = await parseIngameWorkbook(await file.arrayBuffer());
      const savedNs: string[] = [];
      const nextValues: ValuesMap = { ...values };
      const nextHashes: HashesMap = { ...hashes };
      const nextVersions = { ...versions };
      for (const ns of ACTIVE_NAMESPACES) {
        const pv = parsed.values[ns];
        if (!pv) continue;
        const merged = seedNs(ns, pv); // overlay imported onto catalog seed
        const ph = parsed.hashes[ns] ?? {};
        const storeKey = NAMESPACE_STORE_KEY[ns];
        nextVersions[storeKey] = await saveConfig(storeKey, merged);
        nextVersions[metaStoreKey(storeKey)] = await saveConfig(metaStoreKey(storeKey), ph);
        nextValues[ns] = merged;
        nextHashes[ns] = ph;
        savedNs.push(NS_LABEL[ns]);
      }
      setValues(nextValues);
      setHashes(nextHashes);
      setVersions(nextVersions);
      savedRef.current = clone(nextValues);
      invalidateAdminTranslations();
      setMessage(
        savedNs.length
          ? { type: 'success', text: `Imported & saved: ${savedNs.join(', ')}.` }
          : { type: 'error', text: 'No matching namespace sheets found in the file.' },
      );
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'Import failed.' });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <div className="p-6 text-slate-600">Loading translations…</div>;

  const defs = INGAME_CATALOG[activeNs];
  const nsVals = values[activeNs] ?? {};
  const nsHashes = hashes[activeNs] ?? {};

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">In-game text</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Player-facing strings shown during games, shared across scenarios. English is the
            source; missing cells fall back to the bundled defaults, then English. Use Export /
            Import for the translator round-trip - <span className="font-medium">NEW</span> = never
            translated, <span className="font-medium">STALE</span> = English changed since.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm"
          >
            Export XLSX
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm disabled:opacity-50"
          >
            Import XLSX
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving…' : 'Save tab'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-3 border-b border-slate-200">
        {ACTIVE_NAMESPACES.map((ns) => (
          <button
            key={ns}
            type="button"
            onClick={() => setActiveNs(ns)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              ns === activeNs
                ? 'border-blue-600 text-blue-700 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {NS_LABEL[ns]}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-slate-50 min-w-[12rem]">
                Key / context
              </th>
              {(['en', ...TARGET_LANGS] as string[]).map((lang) => (
                <th key={lang} className="px-2 py-2 text-left font-medium text-slate-700 uppercase">
                  {lang}
                  {lang === 'en' && <span className="ml-1 text-[10px] text-slate-400">(source)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {defs.map((def) => {
              const en = sourceEn(def, nsVals);
              return (
                <tr key={def.key} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2 sticky left-0 bg-white min-w-[12rem]">
                    <div className="font-medium text-slate-800">{def.key}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{def.context}</div>
                    {def.charLimit && (
                      <div className="text-[11px] text-slate-400 mt-0.5">≤ {def.charLimit} chars</div>
                    )}
                  </td>
                  {(['en', ...TARGET_LANGS] as string[]).map((lang) => {
                    const val = nsVals[def.key]?.[lang] ?? '';
                    const status =
                      lang === 'en' ? 'ok' : cellStatus(en, val || undefined, nsHashes[def.key]?.[lang]);
                    return (
                      <td key={lang} className="px-1 py-1">
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setCell(activeNs, def.key, lang, e.target.value)}
                          className={`w-36 px-2 py-1 border rounded text-sm ${
                            status === 'new'
                              ? 'border-amber-300 bg-amber-50'
                              : status === 'stale'
                                ? 'border-orange-400 bg-orange-50'
                                : 'border-slate-300'
                          }`}
                          placeholder={lang === 'en' ? def.seed.en : ''}
                          dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        />
                        {status !== 'ok' && (
                          <div
                            className={`text-[10px] mt-0.5 ${
                              status === 'new' ? 'text-amber-600' : 'text-orange-600'
                            }`}
                          >
                            {status.toUpperCase()}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Languages: {SUPPORTED_LANGS.length} total. Saving updates the synced store; field devices
        pick up changes on their next sync. (Mystery / Tracks namespaces have no shared keys yet.)
      </p>
    </div>
  );
}
