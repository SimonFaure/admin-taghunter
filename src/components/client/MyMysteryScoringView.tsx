import { useTranslation } from 'react-i18next';
import { MysteryScoringEditor } from '../mystery/MysteryScoringEditor';

// Licensee page: Mystery scoring defaults by age + per scenario. The same
// editor is embedded in the admin licensee page (ClientDetailView).
export function MyMysteryScoringView() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{t('mysteryScoring:title')}</h1>
        <p className="mt-1 text-slate-600">{t('mysteryScoring:subtitle')}</p>
      </div>
      <MysteryScoringEditor />
    </div>
  );
}
