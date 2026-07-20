import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, RotateCcw, Save, Loader2, AlertCircle } from 'lucide-react';
import { reportLayoutsClientApi } from '../../lib/reportLayoutsClientApi';
import type { ReportLayout, ReportPrintFormat } from '../../lib/api';
import { ReportLayoutEditor } from '../ReportLayoutEditor';
import { useSecureAuth } from '../../contexts/SecureAuthContext';

// Client-portal mission-report PDF editor. Each game type starts on the
// TagHunter default designed in admin → Report layouts; saving here creates
// this client's own version (used by its playgrounds only), and "revert"
// falls back to the default. Backend: report_layouts.php client_* actions.

const GAME_TYPE_LABELS: Record<string, string> = {
  mystery: 'Mystery',
  tagquest: 'Tagquest',
  tracks: 'Track',
  clash: 'Clash',
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

// Which logo the reports print: the TagHunter brand, the client's uploaded
// company logo, or the client's avatar. Maps onto the two existing account
// fields (report_use_brand_logo + company_logo_uses_avatar).
type ReportLogoChoice = 'taghunter' | 'company' | 'avatar';

// Playground print default when neither the client nor the admin set one.
const FALLBACK_PRINT_FORMAT: ReportPrintFormat = {
  paper: 'ticket_100x150',
  customMm: { width: 100, height: 150 },
  orientation: 'portrait',
};

const PAPER_PRESETS: Array<ReportPrintFormat['paper']> = ['ticket_100x150', 'a4', 'a5', 'a6', 'custom'];

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${MEDIA_BASE_URL}${url}`;
}

export function MyReportLayoutsView() {
  const { t } = useTranslation('client');
  const { user, updateLogoPreference, updateReportLogoPreference } = useSecureAuth();

  const [layouts, setLayouts] = useState<Record<string, ReportLayout>>({});
  const [customized, setCustomized] = useState<Record<string, boolean>>({});
  const [statFields, setStatFields] = useState<Record<string, string[]>>({});
  const [gameTypes, setGameTypes] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The client's own print format (null = inheriting the admin default below).
  const [printFormat, setPrintFormat] = useState<ReportPrintFormat | null>(null);
  const [defaultPrintFormat, setDefaultPrintFormat] = useState<ReportPrintFormat | null>(null);
  const [savingFormat, setSavingFormat] = useState(false);
  const [logoPending, setLogoPending] = useState(false);

  // Current logo choice, derived from the two account fields. Mirrors the
  // server-side resolution in PlaygroundAuthState::build (brand_logo_url).
  const logoChoice: ReportLogoChoice = !user?.report_use_brand_logo
    ? 'taghunter'
    : user.company_logo_uses_avatar !== false || !user.company_logo_url
      ? 'avatar'
      : 'company';

  // Preview fidelity: show exactly what the playgrounds will print - the chosen
  // brand image, or null for the editor's bundled black TagHunter logo.
  const brandLogoUrl =
    logoChoice === 'taghunter'
      ? null
      : resolveMediaUrl(logoChoice === 'company' ? user?.company_logo_url : user?.avatar_url);

  // Persist a logo choice through the existing account-preference endpoints
  // (secure_auth.php), then sync the cached user so the preview updates live.
  const handleLogoChoice = async (choice: ReportLogoChoice) => {
    if (choice === logoChoice || logoPending) return;
    setLogoPending(true); setError(null);
    const postPref = async (action: string, body: Record<string, unknown>) => {
      const response = await fetch(`${API_BASE_URL}/secure_auth.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': user?.token || '' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to update logo preference');
    };
    try {
      const wantBrand = choice !== 'taghunter';
      if (wantBrand !== !!user?.report_use_brand_logo) {
        await postPref('update-report-logo-preference', { use_brand_logo: wantBrand });
        updateReportLogoPreference(wantBrand);
      }
      if (wantBrand) {
        const wantAvatar = choice === 'avatar';
        if (wantAvatar !== (user?.company_logo_uses_avatar !== false)) {
          await postPref('update-logo-preference', { use_avatar: wantAvatar });
          updateLogoPreference(wantAvatar);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo preference save failed');
    } finally {
      setLogoPending(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await reportLayoutsClientApi.getAll();
        setLayouts(data.layouts);
        setCustomized(data.customized);
        setStatFields(data.stat_fields);
        setGameTypes(data.game_types);
        setActive(data.game_types[0] ?? '');
        setPrintFormat(data.print_format);
        setDefaultPrintFormat(data.default_print_format);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const layout = layouts[active];

  // What the client's devices will default to right now (own → admin → built-in).
  const effectiveFormat = printFormat ?? defaultPrintFormat ?? FALLBACK_PRINT_FORMAT;

  // Persist immediately (it's a preference, not a design draft). `null` clears
  // the client's own format, falling back to the admin default.
  const persistFormat = async (next: ReportPrintFormat | null) => {
    setPrintFormat(next);
    if (next && next.paper === 'custom' && (next.customMm.width <= 0 || next.customMm.height <= 0)) return;
    setSavingFormat(true); setError(null);
    try {
      await reportLayoutsClientApi.savePrintFormat(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Print format save failed');
    } finally {
      setSavingFormat(false);
    }
  };

  const handleSave = async () => {
    if (!layout) return;
    setSaving(true); setError(null);
    try {
      await reportLayoutsClientApi.save(active, layout);
      setCustomized((prev) => ({ ...prev, [active]: true }));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!confirm(t('reportLayouts.revertConfirm', { gameType: GAME_TYPE_LABELS[active] || active }))) return;
    setSaving(true); setError(null);
    try {
      const res = await reportLayoutsClientApi.reset(active);
      setLayouts((prev) => ({ ...prev, [active]: res.layout }));
      setCustomized((prev) => ({ ...prev, [active]: false }));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revert failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        <Loader2 className="animate-spin mr-2" size={20} /> {t('reportLayouts.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Printer size={22} /> {t('reportLayouts.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('reportLayouts.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {customized[active] && (
            <button
              onClick={handleRevert}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <RotateCcw size={15} /> {t('reportLayouts.revert')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-slate-900 hover:bg-slate-700 text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} {t('reportLayouts.save')}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Default print output for this client's devices. Own format → admin
          default; a device's local Settings → Printing choice wins over both. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200">
        <span className="text-sm font-medium text-slate-700">{t('reportLayouts.printFormatTitle')}</span>
        <select
          value={effectiveFormat.paper}
          onChange={(e) => persistFormat({ ...effectiveFormat, paper: e.target.value as ReportPrintFormat['paper'] })}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700"
        >
          {PAPER_PRESETS.map((p) => (
            <option key={p} value={p}>{t(`reportLayouts.paper_${p}`)}</option>
          ))}
        </select>
        {effectiveFormat.paper === 'custom' && (
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="number" min={20} max={500}
              value={effectiveFormat.customMm.width}
              onChange={(e) => setPrintFormat({ ...effectiveFormat, customMm: { ...effectiveFormat.customMm, width: Number(e.target.value) } })}
              onBlur={() => persistFormat(printFormat ?? effectiveFormat)}
              className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
            ×
            <input
              type="number" min={20} max={500}
              value={effectiveFormat.customMm.height}
              onChange={(e) => setPrintFormat({ ...effectiveFormat, customMm: { ...effectiveFormat.customMm, height: Number(e.target.value) } })}
              onBlur={() => persistFormat(printFormat ?? effectiveFormat)}
              className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
            mm
          </span>
        )}
        <select
          value={effectiveFormat.orientation}
          onChange={(e) => persistFormat({ ...effectiveFormat, orientation: e.target.value as ReportPrintFormat['orientation'] })}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700"
        >
          <option value="portrait">{t('reportLayouts.orientationPortrait')}</option>
          <option value="landscape">{t('reportLayouts.orientationLandscape')}</option>
        </select>
        {savingFormat && <Loader2 className="animate-spin text-slate-400" size={15} />}
        {printFormat ? (
          <button
            onClick={() => persistFormat(null)}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            {t('reportLayouts.printFormatReset')}
          </button>
        ) : (
          <span className="text-xs text-slate-400">{t('reportLayouts.printFormatInherited')}</span>
        )}
      </div>

      {/* Which logo the reports print. Company requires an uploaded logo
          (My Account); the choice maps onto the shared brand-image fields. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200">
        <span className="text-sm font-medium text-slate-700">{t('reportLayouts.logoTitle')}</span>
        <div className="flex rounded-lg overflow-hidden border border-slate-300">
          {(['taghunter', 'company', 'avatar'] as ReportLogoChoice[]).map((choice) => {
            const disabled = choice === 'company' && !user?.company_logo_url;
            return (
              <button
                key={choice}
                onClick={() => handleLogoChoice(choice)}
                disabled={disabled || logoPending}
                title={disabled ? t('reportLayouts.logoCompanyMissing') : undefined}
                className={`px-3 py-1.5 text-sm ${
                  logoChoice === choice ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {t(`reportLayouts.logo_${choice}`)}
              </button>
            );
          })}
        </div>
        {brandLogoUrl && (
          <img src={brandLogoUrl} alt="" className="h-8 w-auto rounded border border-slate-200 bg-white p-0.5" />
        )}
        {logoPending && <Loader2 className="animate-spin text-slate-400" size={15} />}
        <span className="text-xs text-slate-400">{t('reportLayouts.logoHint')}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {gameTypes.map((gt) => (
          <button
            key={gt}
            onClick={() => setActive(gt)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active === gt ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {GAME_TYPE_LABELS[gt] || gt}
            {customized[gt] && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-emerald-500 align-middle" title={t('reportLayouts.customizedBadge')} />}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        {customized[active] ? t('reportLayouts.customizedHint') : t('reportLayouts.defaultHint')}
      </p>

      {/* The shared editor is dark-themed; wrap so it reads on the light client portal. */}
      {layout && (
        <div className="bg-slate-900 rounded-xl p-4">
          <ReportLayoutEditor
            layout={layout}
            availableFields={statFields[active] ?? []}
            showTitleFields
            logoUrl={brandLogoUrl}
            onChange={(next) => { setLayouts((prev) => ({ ...prev, [active]: next })); setDirty(true); }}
          />
        </div>
      )}
    </div>
  );
}
