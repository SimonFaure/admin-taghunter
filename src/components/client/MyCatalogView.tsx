import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { ScenarioCatalogView } from '../ScenarioCatalogView';

// Client-portal page for the product catalog (the "Scenarios TH" sheet). Same
// grid the admin gets, in client mode: the whole product line - including
// scenarios this licensee has not bought - with the ones already in their
// account marked and clickable. The grid itself lives in ScenarioCatalogView.
export function MyCatalogView() {
  const { t } = useTranslation('catalog');

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LayoutGrid size={22} /> {t('title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>
      <ScenarioCatalogView audience="client" />
    </div>
  );
}
