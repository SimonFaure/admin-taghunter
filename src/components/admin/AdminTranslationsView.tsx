/**
 * Admin Translations page - a shell over two panels.
 *
 *  - In-game text : player-facing strings SHARED across scenarios, stored as
 *                   versioned blobs in `default_config` and synced to devices.
 *  - Scenarios    : the text authored INTO one scenario (and its files), stored
 *                   as `Localized<string>` maps in `scenarios.data.game_meta`.
 *
 * They are separate tabs because they are separate stores with separate
 * lifecycles, not two views of one thing.
 *
 * Reached as a tab inside the admin Dashboard (`Dashboard.tsx` menu item
 * `translations`); there is no dedicated route.
 */

import { useState } from 'react';
import IngameTextPanel from './translations/IngameTextPanel';
import ScenarioTranslationsPanel from './translations/ScenarioTranslationsPanel';

type Tab = 'ingame' | 'scenarios';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ingame', label: 'In-game text' },
  { id: 'scenarios', label: 'Scenarios' },
];

export default function AdminTranslationsView() {
  const [tab, setTab] = useState<Tab>('ingame');

  return (
    <div>
      <div className="flex gap-1 px-6 pt-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              t.id === tab
                ? 'border-blue-600 text-blue-700 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ingame' ? <IngameTextPanel /> : <ScenarioTranslationsPanel />}
    </div>
  );
}
