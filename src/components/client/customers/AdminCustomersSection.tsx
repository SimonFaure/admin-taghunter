import { useState } from 'react';
import { CustomersPanel } from './CustomersPanel';
import { CustomerDetailPanel } from './CustomerDetailPanel';

// Admin licensee page: that licensee's customers, with full edit/merge (admin
// routes are tab state inside Dashboard, so list <-> detail is local state).
export function AdminCustomersSection({ clientId }: { clientId: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? (
    <CustomerDetailPanel key={openId} clientId={clientId} customerId={openId}
      onBack={() => setOpenId(null)} onNavigate={setOpenId} />
  ) : (
    <CustomersPanel clientId={clientId} onOpen={setOpenId} />
  );
}
