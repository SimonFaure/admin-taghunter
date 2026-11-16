import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { CustomersPanel } from './customers/CustomersPanel';
import { CustomerDetailPanel } from './customers/CustomerDetailPanel';

// /my/customers - the licensee's own customers (project_licensee_customers).
export function MyCustomersView() {
  const { t } = useTranslation('customers');
  const navigate = useNavigate();
  // ?new=1 (home "Ajouter un client") opens the create form; drop it from the URL
  // so a reload or Back does not reopen it.
  const [params, setParams] = useSearchParams();
  const [startCreating] = useState(() => params.get('new') === '1');
  useEffect(() => {
    if (params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Building2 className="w-6 h-6" />{t('title')}</h2>
        <p className="text-slate-600 mt-1">{t('subtitle')}</p>
      </div>
      <CustomersPanel onOpen={(id) => navigate(`/my/customers/${id}`)} startCreating={startCreating} />
    </div>
  );
}

// /my/customers/:id
export function MyCustomerDetailView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const onNavigate = useCallback((target: string) => navigate(`/my/customers/${target}`, { replace: true }), [navigate]);
  return (
    <CustomerDetailPanel
      key={id}
      customerId={id}
      onBack={() => navigate('/my/customers')}
      onNavigate={onNavigate}
    />
  );
}
