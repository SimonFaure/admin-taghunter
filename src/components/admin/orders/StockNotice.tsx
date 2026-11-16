import { Info } from 'lucide-react';

// Permanent reminder requested with the Commandes feature: Studio does not track
// stock or rental availability (possible future evolution).
export function StockNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        <strong>No stock control:</strong> check availability yourself before confirming a request.
        Possible future evolution: stock management / rental availability calendar.
      </span>
    </div>
  );
}
