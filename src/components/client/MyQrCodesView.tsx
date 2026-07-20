import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Download, QrCode } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
// The player PWAs. Each QR opens the app pointed at a specific client + scenario;
// the QR is durable/printable (memory project_taghunter_go / project_taghunter_drop).
const GO_BASE_URL = import.meta.env.VITE_GO_BASE_URL || 'https://go.taghunter.fr';
const DROP_BASE_URL = import.meta.env.VITE_DROP_BASE_URL || 'https://drop.taghunter.fr';

function playerUrl(base: string, clientId: string, scenarioId: string): string {
  return `${base}/?c=${encodeURIComponent(clientId)}&s=${encodeURIComponent(scenarioId)}`;
}

/** Normalized QR target - one card per scenario. */
interface QrItem {
  id: string;
  title: string;
}

/**
 * Client "QR codes" - printable launch QR codes for the GO / Drop scenarios this
 * client has been granted. Each QR opens the matching player PWA on a phone,
 * scoped to this client + scenario. One section per enabled app
 * (project_taghunter_go / project_taghunter_drop).
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
      </div>
      <p className="text-slate-600 mb-6">
        {t('clientGameConfig:qrCodes.subtitle')}
      </p>

      {access.go && (
        <QrSection clientId={clientId} app="go" baseUrl={GO_BASE_URL} heading="Tag Hunter GO" accent="emerald" />
      )}
      {access.drop && (
        <QrSection clientId={clientId} app="drop" baseUrl={DROP_BASE_URL} heading="Tag Hunter Drop" accent="sky" />
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
  app: 'go' | 'drop';
  baseUrl: string;
  heading: string;
  accent: 'emerald' | 'sky';
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<QrItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (app === 'drop') {
          // Drop grants (mode='drop') - exactly the scenarios this client runs in Drop.
          const res = await authFetch(
            `${API_BASE_URL}/client_scenarios.php?action=list_drop&client_id=${clientId}`,
            { credentials: 'include' },
          );
          if (res.ok) {
            const json = await res.json();
            const rows = (json.data || []) as Array<{ scenario_id: string | number; title: string }>;
            if (!cancelled) setItems(rows.map((r) => ({ id: String(r.scenario_id), title: r.title })));
          }
        } else {
          // GO uses the regular grant list, filtered to GO-capable scenarios.
          const res = await authFetch(
            `${API_BASE_URL}/client_scenarios.php?action=list&client_id=${clientId}`,
            { credentials: 'include' },
          );
          if (res.ok) {
            const json = await res.json();
            const rows = ((json.data || []) as ClientScenario[]).filter((s) => s.adaptable_go);
            if (!cancelled) setItems(rows.map((s) => ({ id: String(s.id), title: s.title })));
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
            <div key={s.id} className="border border-slate-200 rounded-xl p-5 flex flex-col items-center bg-white">
              <h3 className="font-semibold text-slate-900 text-center mb-3 truncate w-full">{s.title}</h3>
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
