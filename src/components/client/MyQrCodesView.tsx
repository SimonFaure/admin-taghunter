import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Eye, QrCode, X } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { HelpButton } from '../../help';
import {
  DurationCatalogCard,
  ScenarioDurationPicker,
  useDurationCatalog,
} from '../go/durations';
import { ScenarioLanguagePicker, type PlayerLanguages } from '../go/playerLanguages';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
// The player PWAs. Each QR opens the app pointed at a specific client + scenario;
// the QR is durable/printable (memory project_taghunter_go / project_taghunter_spot).
const GO_BASE_URL = import.meta.env.VITE_GO_BASE_URL || 'https://go.taghunter.fr';
const SPOT_BASE_URL = import.meta.env.VITE_SPOT_BASE_URL || 'https://spot.taghunter.fr';

function playerUrl(base: string, clientId: string, scenarioId: string): string {
  return `${base}/?c=${encodeURIComponent(clientId)}&s=${encodeURIComponent(scenarioId)}`;
}

/** Normalized QR target - one card per scenario. */
interface QrItem {
  id: string;
  title: string;
  /** The challenges offered for this scenario in this app (minutes). */
  durations: number[];
  /** Language picker policy for this scenario in this app. */
  playerLanguages?: PlayerLanguages;
  /** The languages this client may be served the scenario in. */
  scenarioLanguages: string[];
}

/**
 * Client "QR codes" - printable launch QR codes for the GO / Spot scenarios this
 * client has been granted. Each QR opens the matching player PWA on a phone,
 * scoped to this client + scenario. One section per enabled app
 * (project_taghunter_go / project_taghunter_spot).
 */
export function MyQrCodesView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const access = getAppAccess(user);
  const clientId = user?.client_id ?? '';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <QrCode className="w-7 h-7 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{t('clientGameConfig:qrCodes.title')}</h1>
        <HelpButton chapter={access.go ? 'go-studio' : 'spot-studio'} className="ml-auto" />
      </div>
      <p className="text-slate-600 mb-6">
        {t('clientGameConfig:qrCodes.subtitle')}
      </p>

      {access.go && (
        <QrSection clientId={clientId} app="go" baseUrl={GO_BASE_URL} heading="Tag Hunter GO" accent="emerald" />
      )}
      {access.spot && (
        <QrSection clientId={clientId} app="spot" baseUrl={SPOT_BASE_URL} heading="Tag Hunter Spot" accent="sky" />
      )}
    </div>
  );
}

/** One app's QR grid, self-fetching its granted scenarios. */
function QrSection({
  clientId,
  app,
  baseUrl,
  heading,
  accent,
}: {
  clientId: string;
  app: 'go' | 'spot';
  baseUrl: string;
  heading: string;
  accent: 'emerald' | 'sky';
}) {
  const { t } = useTranslation();
  // Each app has its own catalog (GO 30/60/90, Spot 15/30/45 by default), loaded
  // once per section and handed to every QR card so the tick-box rows don't each
  // re-fetch it (project_go_spot_durations).
  const { catalog, loading: catalogLoading, save: saveCatalog } = useDurationCatalog(app);
  const [items, setItems] = useState<QrItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Card shown full page - for projecting / holding up to a room.
  const [fullscreen, setFullscreen] = useState<QrItem | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Both apps read their real grants (mode='go' / mode='spot') — exactly
        // the pairs go.php will serve. The generic `list` action returns the whole
        // playground catalogue for PREMIUM clients regardless of GO/Spot grants,
        // so a grid built from it would show QR codes for scenarios this client
        // was never granted in GO/Spot.
        const action = app === 'spot' ? 'list_spot' : 'list_go';
        const res = await authFetch(
          `${API_BASE_URL}/client_scenarios.php?action=${action}&client_id=${clientId}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const json = await res.json();
          const rows = (json.data || []) as Array<{
            scenario_id: string | number;
            title: string;
            durations?: number[];
            player_languages?: PlayerLanguages;
            scenario_languages?: string[];
          }>;
          if (!cancelled) {
            setItems(
              rows.map((r) => ({
                id: String(r.scenario_id),
                title: r.title,
                durations: r.durations ?? [],
                playerLanguages: r.player_languages,
                scenarioLanguages: r.scenario_languages ?? [],
              })),
            );
          }
        }
      } catch (err) {
        console.error(`Failed to load ${app} scenarios for QR codes:`, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, app]);

  const headingColor = accent === 'sky' ? 'text-sky-600' : 'text-emerald-600';

  const qrId = (id: string) => `qr-${app}-${id}`;
  const downloadQr = (item: QrItem) => {
    const svg = document.getElementById(qrId(item.id));
    if (!(svg instanceof SVGSVGElement)) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tgh-${app}-${(item.title || item.id).toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mb-10">
      <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${headingColor}`}>{heading}</h2>
      <DurationCatalogCard catalog={catalog} onSave={saveCatalog} loading={catalogLoading} />
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <QrCode className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">{t('clientGameConfig:qrCodes.noScenarios', { heading })}</p>
          <p className="text-sm text-slate-500 mt-1">
            {t('clientGameConfig:qrCodes.willAppear')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((s) => (
            <div key={s.id} className="relative border border-slate-200 rounded-xl p-5 flex flex-col items-center bg-white">
              <button
                onClick={() => setFullscreen(s)}
                title={t('clientGameConfig:qrCodes.showFullscreen')}
                aria-label={t('clientGameConfig:qrCodes.showFullscreen')}
                className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <Eye className="w-5 h-5" />
              </button>
              <h3 className="font-semibold text-slate-900 text-center mb-3 truncate w-full px-7">{s.title}</h3>
              <div className="bg-white p-2 rounded-lg border border-slate-100">
                <QRCodeSVG id={qrId(s.id)} value={playerUrl(baseUrl, clientId, s.id)} size={176} level="M" marginSize={2} />
              </div>
              <p className="mt-3 text-[11px] text-slate-400 break-all text-center">{playerUrl(baseUrl, clientId, s.id)}</p>
              <button
                onClick={() => downloadQr(s)}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> {t('clientGameConfig:qrCodes.downloadSvg')}
              </button>

              {/* Which challenges this QR proposes. One = applied silently;
                  several = the player picks on the setup screen. */}
              <div className="mt-4 w-full border-t border-slate-100 pt-3">
                <ScenarioDurationPicker
                  scenarioId={s.id}
                  app={app}
                  catalog={catalog}
                  initial={s.durations}
                />
              </div>
              <div className="mt-3 w-full border-t border-slate-100 pt-3">
                <ScenarioLanguagePicker
                  scenarioId={s.id}
                  app={app}
                  scenarioLanguages={s.scenarioLanguages}
                  initial={s.playerLanguages}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white p-6"
          onClick={() => setFullscreen(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(null);
            }}
            title={t('clientGameConfig:qrCodes.exitFullscreen')}
            aria-label={t('clientGameConfig:qrCodes.exitFullscreen')}
            className="absolute top-4 right-4 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
          <h2 className="mb-1 text-2xl font-bold text-slate-900 text-center">{fullscreen.title}</h2>
          <p className={`mb-6 text-sm font-semibold uppercase tracking-wide ${headingColor}`}>{heading}</p>
          <QRCodeSVG
            value={playerUrl(baseUrl, clientId, fullscreen.id)}
            level="M"
            marginSize={2}
            className="h-[min(70vh,70vw)] w-[min(70vh,70vw)]"
          />
        </div>
      )}
    </section>
  );
}
