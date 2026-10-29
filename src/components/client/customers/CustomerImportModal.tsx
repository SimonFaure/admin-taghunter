import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { customersApi } from '../../../lib/customersApi';
import type { Customer, CustomerInput } from '../../../types/customer';
import { CustomerModal, btnPrimary, btnSecondary, inputCls } from './customerUi';
import { errorMessage } from './customerFormat';

// Bulk import of licensee customers from an .xlsx / .csv file: header row
// auto-mapped (FR/EN/ES), per-row preview, then posted in chunks. The server
// skips names that already exist (case/accent-insensitive) - the preview here
// only anticipates that.

type Field = 'name' | 'type' | 'contact_name' | 'email' | 'phone' | 'city' | 'notes';
const FIELDS: Field[] = ['name', 'type', 'contact_name', 'email', 'phone', 'city', 'notes'];
const FIELD_LABEL: Record<Field, string> = {
  name: 'fields.name', type: 'fields.type', contact_name: 'fields.contactName', email: 'fields.email',
  phone: 'fields.phone', city: 'fields.city', notes: 'fields.notes',
};
const SYNONYMS: Record<Field, string[]> = {
  name: ['nom', 'name', 'nombre', 'client', 'customer', 'cliente', 'raison sociale', 'societe', 'structure', 'organisation', 'organization'],
  type: ['type', 'tipo', 'categorie', 'category', 'categoria'],
  contact_name: ['contact', 'personne a contacter', 'contact person', 'contact name', 'persona de contacto', 'interlocuteur', 'referent'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'correo', 'correo electronico'],
  phone: ['telephone', 'tel', 'phone', 'telefono', 'portable', 'mobile', 'movil'],
  city: ['ville', 'city', 'ciudad', 'commune', 'localite'],
  notes: ['notes', 'note', 'remarques', 'commentaire', 'commentaires', 'comments', 'notas', 'observaciones'],
};
const CHUNK = 500;

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function autoMap(headers: string[]): Record<Field, number> {
  const map = {} as Record<Field, number>;
  for (const f of FIELDS) {
    map[f] = headers.findIndex((h) => SYNONYMS[f].includes(key(h)));
  }
  return map;
}

export function CustomerImportModal({ clientId, existing, onClose, onImported }: {
  clientId?: number;
  existing: Customer[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation('customers');
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<Field, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
        .map((r) => r.map((c) => String(c ?? '').trim()));
      if (all.length < 2) throw new Error('empty');
      setHeaders(all[0]);
      setRows(all.slice(1).filter((r) => r.some((c) => c !== '')));
      setMapping(autoMap(all[0]));
    } catch {
      setError(t('import.parseError'));
      setHeaders(null);
    }
  };

  const parsed = useMemo(() => {
    if (!mapping) return [];
    const known = new Set(existing.map((c) => key(c.name)));
    const seen = new Set<string>();
    return rows.map((r) => {
      const input: CustomerInput = {};
      for (const f of FIELDS) {
        const i = mapping[f];
        if (i >= 0 && r[i]) (input as Record<string, string>)[f] = r[i];
      }
      const k = key(input.name ?? '');
      let status: 'new' | 'exists' | 'duplicate' | 'invalid' = 'new';
      if (!k) status = 'invalid';
      else if (known.has(k)) status = 'exists';
      else if (seen.has(k)) status = 'duplicate';
      seen.add(k);
      return { input, status };
    });
  }, [rows, mapping, existing]);

  const toImport = parsed.filter((p) => p.status === 'new');

  const run = async () => {
    setBusy(true);
    setError(null);
    let created = 0;
    let skipped = parsed.length - toImport.length;
    try {
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const res = await customersApi.import(toImport.slice(i, i + CHUNK).map((p) => p.input), clientId);
        created += res.created;
        skipped += res.skipped.length;
      }
      setResult({ created, skipped });
      onImported();
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const statusCls = { new: 'text-emerald-700', exists: 'text-slate-400', duplicate: 'text-amber-600', invalid: 'text-red-600' };

  return (
    <CustomerModal title={t('import.title')} onClose={onClose} wide
      footer={result ? (
        <button onClick={onClose} className={btnPrimary}>{t('import.close')}</button>
      ) : (<>
        <button onClick={onClose} className={btnSecondary}>{t('form.cancel')}</button>
        <button onClick={run} disabled={busy || !mapping || mapping.name < 0 || toImport.length === 0} className={btnPrimary}>
          {t('import.importN', { count: toImport.length })}
        </button>
      </>)}
    >
      {result ? (
        <div className="space-y-1 text-sm text-slate-700">
          <p className="font-medium text-emerald-700">{t('import.done', { count: result.created })}</p>
          {result.skipped > 0 && <p>{t('import.skipped', { count: result.skipped })}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('import.intro')}</p>
          <label className={`${btnSecondary} inline-flex items-center gap-2 cursor-pointer`}>
            <Upload className="w-4 h-4" />{t('import.chooseFile')}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {headers && mapping && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">{t('import.mapping')}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {FIELDS.map((f) => (
                    <div key={f}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">{t(FIELD_LABEL[f])}{f === 'name' ? ' *' : ''}</label>
                      <select value={mapping[f]} onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })} className={inputCls}>
                        <option value={-1}>{t('import.ignore')}</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {mapping.name < 0 && <p className="text-sm text-amber-700 mt-2">{t('import.noName')}</p>}
              </div>
              {mapping.name >= 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">{t('import.preview', { count: parsed.length })}</h4>
                  <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {parsed.slice(0, 300).map((p, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-slate-900">{p.input.name || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{p.input.city || ''}</td>
                            <td className={`px-3 py-1.5 text-right text-xs font-medium ${statusCls[p.status]}`}>{t(`import.status.${p.status}`)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </CustomerModal>
  );
}
