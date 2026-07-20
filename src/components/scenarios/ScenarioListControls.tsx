import { LayoutGrid, List as ListIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ScenarioListControlsOption {
  value: string;
  label: string;
}

export interface ScenarioListControlsProps {
  viewMode: 'grid' | 'list';
  onViewModeChange: (v: 'grid' | 'list') => void;

  groupBy: string;
  onGroupByChange: (g: string) => void;
  groupOptions: ScenarioListControlsOption[];

  // Sort controls are optional - admin doesn't have one yet, only client.
  sortBy?: string;
  onSortByChange?: (s: string) => void;
  sortOptions?: ScenarioListControlsOption[];

  // Per-view actions (Create, Import, etc.). Filter pills are intentionally NOT
  // here - admin and client filter taxonomies diverge enough that sharing them
  // costs more than it saves.
  extraActions?: ReactNode;

  // When true, render ONLY the grid/list view toggle - hide the sort + group-by
  // selects (and any extraActions are simply not passed by the caller). Used by
  // the "GO client only" client portal, which keeps just the cards/list switch.
  viewToggleOnly?: boolean;
}

export function ScenarioListControls({
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  groupOptions,
  sortBy,
  onSortByChange,
  sortOptions,
  extraActions,
  viewToggleOnly = false,
}: ScenarioListControlsProps) {
  const { t } = useTranslation('scenarioListControls');
  const showSort = !viewToggleOnly && sortBy !== undefined && onSortByChange && sortOptions && sortOptions.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!viewToggleOnly && extraActions}

      {showSort && (
        <label className="inline-flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium uppercase tracking-wide">{t('sort')}</span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange!(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {sortOptions!.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}

      {!viewToggleOnly && (
        <label className="inline-flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium uppercase tracking-wide">{t('groupBy')}</span>
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {groupOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          title={t('gridView')}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          title={t('listView')}
        >
          <ListIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
