import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Truck } from 'lucide-react';
import { addressesApi, AddressesApiError, type ClientAddresses, type MainAddress, type ShippingAddress } from '../../lib/addressesApi';

// Main (company) + shipping address of a licensee. Used in Mon compte (own account)
// and on the admin licensee page (clientId). The main address is shared with the
// Events legal identity; Commandes prefills deliveries from shipping, else main.

const COUNTRIES = ['FR', 'BE', 'CH', 'LU', 'MC', 'ES', 'PT', 'IT', 'DE', 'AT', 'NL', 'IE', 'GB', 'DK', 'SE', 'FI', 'NO', 'PL', 'CZ', 'GR',
  'HR', 'SI', 'SK', 'HU', 'RO', 'BG', 'EE', 'LV', 'LT', 'MT', 'CY', 'CA', 'US', 'MA', 'TN', 'DZ', 'RE', 'GP', 'MQ', 'GF', 'NC', 'PF'];

const EMPTY_MAIN: MainAddress = { company: null, address_line1: null, address_line2: null, postal_code: null, city: null, country: null, phone: null };
const EMPTY: ClientAddresses = { main: EMPTY_MAIN, shipping_same_as_main: true, shipping: { ...EMPTY_MAIN, name: null } };

const inputCls = (bad: boolean) => `mt-1 w-full rounded-lg border px-3 py-2 text-sm ${bad ? 'border-rose-400' : 'border-slate-300'}`;

/** Licensee "Mon compte" card. */
export function AddressesCard() {
  const { t } = useTranslation('addresses');
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-900 mb-4">{t('title')}</h3>
      <AddressesForm />
    </div>
  );
}

export function AddressesForm({ clientId }: { clientId?: number }) {
  const { t, i18n } = useTranslation('addresses');
  const [data, setData] = useState<ClientAddresses>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const countryNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' });
    } catch {
      return null;
    }
  }, [i18n.language]);

  useEffect(() => {
    addressesApi.get(clientId)
      .then(setData)
      .catch(() => setMessage({ ok: false, text: t('loadError') }))
      .finally(() => setLoading(false));
  }, [clientId, t]);

  const setMain = (k: keyof MainAddress, v: string) => setData((d) => ({ ...d, main: { ...d.main, [k]: v || null } }));
  const setShip = (k: keyof ShippingAddress, v: string) => setData((d) => ({ ...d, shipping: { ...d.shipping, [k]: v || null } }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      setData(await addressesApi.save(data, clientId));
      setMessage({ ok: true, text: t('saved') });
    } catch (e) {
      if (e instanceof AddressesApiError && e.message === 'validation') {
        setErrors(e.errors);
        setMessage({ ok: false, text: t('fixErrors') });
      } else {
        setMessage({ ok: false, text: t('saveError') });
      }
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) => errors[key] && <span className="text-xs text-rose-600">{errors[key] === 'required' ? t('required') : t('invalid')}</span>;

  const fields = <K extends string>(prefix: 'main' | 'shipping', values: Record<K, string | null>, set: (k: K, v: string) => void, keys: K[]) => (
    <div className="grid sm:grid-cols-2 gap-3">
      {keys.map((k) => {
        const key = `${prefix}.${k}`;
        const wide = k === 'address_line1' || k === 'address_line2';
        if (k === 'country') {
          const v = values[k] ?? '';
          return (
            <label key={k} className="text-sm text-slate-700">
              {t(`fields.${k}`)}
              <select value={v} onChange={(e) => set(k, e.target.value)} className={inputCls(!!errors[key])}>
                <option value="">-</option>
                {(COUNTRIES.includes(v) || !v ? COUNTRIES : [v, ...COUNTRIES]).map((c) => (
                  <option key={c} value={c}>{countryNames?.of(c) ?? c}</option>
                ))}
              </select>
              {err(key)}
            </label>
          );
        }
        return (
          <label key={k} className={`text-sm text-slate-700 ${wide ? 'sm:col-span-2' : ''}`}>
            {t(`fields.${k}`)}
            <input type={k === 'phone' ? 'tel' : 'text'} value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={inputCls(!!errors[key])} />
            {err(key)}
          </label>
        );
      })}
    </div>
  );

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-semibold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4" />{t('mainTitle')}</h4>
        <p className="text-xs text-slate-500 mb-3">{t('mainHint')}</p>
        {fields('main', data.main, setMain, ['company', 'phone', 'address_line1', 'address_line2', 'postal_code', 'city', 'country'])}
      </div>

      <div>
        <h4 className="font-semibold text-slate-900 flex items-center gap-2"><Truck className="w-4 h-4" />{t('shippingTitle')}</h4>
        <p className="text-xs text-slate-500 mb-3">{t('shippingHint')}</p>
        <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
          <input type="checkbox" checked={data.shipping_same_as_main} onChange={(e) => setData((d) => ({ ...d, shipping_same_as_main: e.target.checked }))} />
          {t('sameAsMain')}
        </label>
        {!data.shipping_same_as_main && fields('shipping', data.shipping, setShip, ['name', 'company', 'phone', 'address_line1', 'address_line2', 'postal_code', 'city', 'country'])}
      </div>

      <div className="flex items-center justify-end gap-3">
        {message && <span className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</span>}
        <button type="button" disabled={saving} onClick={() => void save()} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
}
