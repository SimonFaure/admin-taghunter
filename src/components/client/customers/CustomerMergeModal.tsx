import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customersApi } from '../../../lib/customersApi';
import type { Customer } from '../../../types/customer';
import { CustomerModal, btnPrimary, btnSecondary, inputCls } from './customerUi';
import { errorMessage } from './customerFormat';

// Merge a (duplicate) customer into another: its games move, it becomes a
// tombstone that devices and later playground pushes are redirected from.
export function CustomerMergeModal({ clientId, source, candidates, onClose, onMerged }: {
  clientId?: number;
  source: Customer;
  candidates: Customer[];
  onClose: () => void;
  onMerged: (targetId: string) => void;
}) {
  const { t } = useTranslation('customers');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = candidates.filter((c) => c.id !== source.id);

  const merge = async () => {
    setBusy(true);
    setError(null);
    try {
      await customersApi.merge(source.id, targetId, clientId);
      onMerged(targetId);
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
      setBusy(false);
    }
  };

  return (
    <CustomerModal title={t('merge.title', { name: source.name })} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>{t('form.cancel')}</button>
        <button onClick={merge} disabled={!targetId || busy} className={btnPrimary}>{t('merge.confirm')}</button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('merge.intro', { name: source.name })}</p>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('merge.target')}</label>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputCls}>
            <option value="">{t('merge.targetPlaceholder')}</option>
            {targets.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ''}</option>)}
          </select>
        </div>
        {targetId && <p className="text-sm text-slate-700">{t('merge.gamesWillMove', { count: source.games_count })}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </CustomerModal>
  );
}
