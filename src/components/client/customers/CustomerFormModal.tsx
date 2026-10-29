import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { customersApi } from '../../../lib/customersApi';
import { findSimilar } from '../../../lib/customerNameMatch';
import type { Customer, CustomerInput, CustomerType } from '../../../types/customer';
import { customerTypeLabel, useCustomerTypes } from '../../../lib/customerTypesApi';
import { CustomerModal, btnPrimary, btnSecondary, inputCls } from './customerUi';
import { errorMessage } from './customerFormat';

// Create / edit a licensee customer. On create, warns about similar existing
// names ("Acme" vs "ACME SA") before a duplicate is made.
export function CustomerFormModal({ clientId, customer, existing, onClose, onSaved }: {
  clientId?: number;
  customer?: Customer | null;
  existing: Customer[];
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const { t, i18n } = useTranslation('customers');
  const types = useCustomerTypes();
  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name ?? '',
    type: customer?.type ?? null,
    contact_name: customer?.contact_name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    city: customer?.city ?? '',
    notes: customer?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const similar = useMemo(() => {
    const name = (form.name ?? '').trim();
    if (customer || name.length < 3) return [];
    return findSimilar(name, existing);
  }, [form.name, existing, customer]);

  const set = (k: keyof CustomerInput, v: string | null) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!(form.name ?? '').trim()) {
      setError(t('form.nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = customer
        ? await customersApi.update(customer.id, form, clientId)
        : await customersApi.create(form, clientId);
      onSaved(saved);
    } catch (err) {
      setError(t('errors.save', { message: errorMessage(err) }));
      setSaving(false);
    }
  };

  const field = (k: keyof CustomerInput, label: string, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} value={(form[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} className={inputCls} />
    </div>
  );

  return (
    <CustomerModal
      title={customer ? t('form.editTitle') : t('form.createTitle')}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>{t('form.cancel')}</button>
        <button onClick={save} disabled={saving} className={btnPrimary}>{t('form.save')}</button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('fields.name')} *</label>
          <input autoFocus value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className={inputCls}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          {similar.length > 0 && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <div className="flex items-center gap-2 font-medium"><AlertTriangle className="w-4 h-4" />{t('form.similarTitle')}</div>
              <ul className="list-disc ml-6 mt-1">{similar.map((s) => <li key={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</li>)}</ul>
              <p className="mt-1 text-xs">{t('form.similarHint')}</p>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('fields.type')}</label>
          <select value={form.type ?? ''} onChange={(e) => set('type', (e.target.value || null) as CustomerType | null)} className={inputCls}>
            <option value="">{t('fields.typeNone')}</option>
            {/* Active types, plus the current one even if an admin deactivated it. */}
            {types.filter((ty) => ty.active || ty.code === customer?.type).map((ty) => (
              <option key={ty.code} value={ty.code}>{customerTypeLabel(types, ty.code, i18n.language)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('contact_name', t('fields.contactName'))}
          {field('city', t('fields.city'))}
          {field('email', t('fields.email'), 'email')}
          {field('phone', t('fields.phone'), 'tel')}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('fields.notes')}</label>
          <textarea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </CustomerModal>
  );
}
