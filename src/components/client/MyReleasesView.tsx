import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Rocket, Download, ExternalLink, Monitor, Smartphone, RefreshCw, AlertCircle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ENDPOINT = `${API_BASE_URL}/playground_update.php`;

interface Release {
  version: string;
  target: string;
  arch: string;
  notes: string;
  pub_date: string | null;
  artifact_size: number | null;
  store_url: string | null;
  download_url: string | null;
}

const TARGET_LABELS: Record<string, string> = {
  windows: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
};

const MOBILE_TARGETS = ['android', 'ios'];

function formatSize(bytes: number | null, t: TFunction): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? t('size.mb', { value: mb.toFixed(1) })
    : t('size.kb', { value: (bytes / 1024).toFixed(0) });
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale);
}

export function MyReleasesView() {
  const { t, i18n } = useTranslation('releases');
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReleases = async () => {
    try {
      setLoading(true);
      setError('');
      // Public endpoint: release downloads are intentionally unauthenticated.
      const res = await fetch(`${ENDPOINT}?action=list`);
      if (!res.ok) throw new Error(t('errorFetch'));
      const json = await res.json();
      setReleases(json.releases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReleases();
  }, []);

  const desktop = releases.filter((r) => !MOBILE_TARGETS.includes(r.target));
  const mobile = releases.filter((r) => MOBILE_TARGETS.includes(r.target));

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Rocket className="w-6 h-6" />
              <span>{t('title')}</span>
            </h2>
            <p className="text-slate-600 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <button
            onClick={fetchReleases}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">{t('refresh')}</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
          </div>
        ) : releases.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <Rocket className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('empty.title')}</h3>
            <p className="text-slate-600">{t('empty.description')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {desktop.length > 0 && (
              <Section icon={Monitor} title={t('section.desktop')}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {desktop.map((r) => (
                    <ReleaseCard key={`${r.target}-${r.arch}`} release={r} t={t} locale={i18n.language} />
                  ))}
                </div>
              </Section>
            )}

            {mobile.length > 0 && (
              <Section icon={Smartphone} title={t('section.mobile')}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mobile.map((r) => (
                    <ReleaseCard key={`${r.target}-${r.arch}`} release={r} t={t} locale={i18n.language} />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function ReleaseCard({ release, t, locale }: { release: Release; t: TFunction; locale: string }) {
  const label = TARGET_LABELS[release.target] || release.target;
  const isMobile = MOBILE_TARGETS.includes(release.target);
  const meta = [release.arch, formatSize(release.artifact_size, t), formatDate(release.pub_date, locale)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="border border-slate-200 rounded-lg p-5 hover:border-slate-300 hover:shadow-md transition-all flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 bg-slate-100 rounded-lg flex items-center justify-center">
          {isMobile ? (
            <Smartphone className="w-5 h-5 text-slate-700" />
          ) : (
            <Monitor className="w-5 h-5 text-slate-700" />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900 truncate">{label}</h4>
          <p className="text-xs text-slate-500 font-mono">{t('versionPrefix')}{release.version}</p>
        </div>
      </div>

      {meta && <p className="text-xs text-slate-500 mb-2">{meta}</p>}

      {release.notes && (
        <p className="text-sm text-slate-600 mb-4 whitespace-pre-line line-clamp-4">{release.notes}</p>
      )}

      <div className="mt-auto pt-2">
        {release.store_url ? (
          <a
            href={release.store_url}
            target="_blank"
            rel="noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('openStore')}
          </a>
        ) : release.download_url ? (
          <a
            href={release.download_url}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('download')}
          </a>
        ) : (
          <span className="block text-center text-xs text-slate-400">{t('notDownloadable')}</span>
        )}
      </div>
    </div>
  );
}
