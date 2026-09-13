/**
 * Standalone printable scenario recap - `/recap/:uniqid`.
 *
 * Deliberately outside ClientLayout: no sidebar, no chrome, nothing the licensee
 * would have to fight when printing. The counterpart section inside
 * `ScenarioDetailView` links here (retour Ludiom #40).
 */

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ScenarioRecapView } from './ScenarioRecapView';

export function ScenarioRecapPage() {
  const { t } = useTranslation('scenarioRecap');
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-4xl px-6">
        <button
          onClick={() => navigate(`/my/scenarios/${uniqid}`)}
          className="recap-no-print mb-4 flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{t('backToScenario')}</span>
        </button>
      </div>
      <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-sm print:rounded-none print:shadow-none">
        <ScenarioRecapView uniqid={uniqid} printable />
      </div>
    </div>
  );
}
