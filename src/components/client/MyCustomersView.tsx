import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { CustomersPanel } from './customers/CustomersPanel';
import { CustomerDetailPanel } from './customers/CustomerDetailPanel';

// /my/customers - the licensee's own customers (project_licensee_customers).
export function MyCustomersView() {
  const { t } = useTranslation('customers');
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Building2 className="w-6 h-6" />{t('title')}</h2>
        <p className="text-slate-600 mt-1">{t('subtitle')}</p>
      </div>
      <CustomersPanel onOpen={(id) => navigate(`/my/customers/${id}`)} />
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
