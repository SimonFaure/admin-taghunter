/**
 * Malus-station picker (tagquest) - the client's si_balises inventory as
 * square, single-select cards. Modelled on Clash's BalisePickerModal, with two
 * deliberate differences:
 *
 *  - single selection (a scenario has at most one malus station), and
 *  - the stored value is the `si_balises.id`, NOT the numeric station_name -
 *    tagquest matches punches directly against pattern station ids, so the
 *    malus station lives in the same space (see useTagquestStations).
 *
 * Stations already assigned to the scenario's selected pattern are disabled: a
 * single physical punch cannot both complete a quest slot and cost malus.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search, X } from 'lucide-react';
import type { StationRow } from '../useTagquestStations';

interface MalusStationPickerModalProps {
  stations: StationRow[];
  loading: boolean;
  error: boolean;
  /** Currently stored malus station (si_balises.id), or null. */
  selected: number | null;
  /** Station ids used by the scenario's selected pattern - not selectable. */
  patternStationIds: Set<number>;
  /** Receives the picked id, or null when the author clears the field. */
  onConfirm: (stationId: number | null) => void;
  onClose: () => void;
}

const SEARCH_THRESHOLD = 20;

export function MalusStationPickerModal({
  stations,
  loading,
  error,
  selected,
  patternStationIds,
  onConfirm,
  onClose,
}: MalusStationPickerModalProps) {
  const { t } = useTranslation();
  // Mounted only while open, so init-once is safe; Cancel/backdrop discards.
  const [draft, setDraft] = useState<number | null>(selected);
  const [query, setQuery] = useState('');

  const knownIds = useMemo(() => new Set(stations.map((s) => s.id)), [stations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        s.station_name.toLowerCase().includes(q) ||
        String(s.id).includes(q) ||
        (s.station_function ?? '').toLowerCase().includes(q),
    );
  }, [stations, query]);

  const showSearch = !loading && !error && stations.length >= SEARCH_THRESHOLD;
  const emptyInventory = !loading && !error && stations.length === 0;
  // A stored id that is no longer in the inventory: shown as an amber chip so
  // the author can see (and clear) it rather than losing it silently.
  const staleSelection = draft != null && !knownIds.has(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {t('editorTagquest:malusStation.pickerTitle')}
            </h3>
            <p className="text-xs text-gray-500">{t('editorTagquest:malusStation.pickerHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            aria-label={t('editorTagquest:malusStation.cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSearch && (
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('editorTagquest:malusStation.pickerSearchPlaceholder')}
                className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {t('editorTagquest:malusStation.pickerLoading')}
            </p>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">
              {t('editorTagquest:malusStation.pickerError')}
            </p>
          ) : emptyInventory ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {t('editorTagquest:malusStation.pickerEmpty')}
            </p>
          ) : (
            <>
              {staleSelection && (
                <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  {t('editorTagquest:malusStation.unknownSelected', { id: draft })}
                </p>
              )}
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {visible.map((s) => {
                  const isSelected = draft === s.id;
                  // Pattern stations can never be picked, but a legacy conflict
                  // stays deselectable so the author can resolve it here.
                  const usedByPattern = patternStationIds.has(s.id);
                  const disabled = usedByPattern && !isSelected;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setDraft(isSelected ? null : s.id)}
                      title={
                        usedByPattern ? t('editorTagquest:malusStation.usedByPattern') : undefined
                      }
                      className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-colors ${
                        disabled
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? usedByPattern
                              ? 'border-2 border-red-500 bg-red-50'
                              : 'border-2 border-blue-600 bg-blue-50'
                            : 'border-gray-300 bg-white hover:border-blue-400'
                      }`}
                    >
                      {isSelected && (
                        <span
                          className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center ${
                            usedByPattern ? 'bg-red-500' : 'bg-blue-600'
                          }`}
                        >
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                      <span
                        className={`text-2xl font-bold ${
                          disabled ? 'text-gray-400' : usedByPattern ? 'text-red-700' : 'text-gray-900'
                        }`}
                      >
                        {s.station_name || '?'}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400">#{s.id}</span>
                      {s.station_function && (
                        <span className="text-[10px] text-gray-500 truncate max-w-full">
                          {s.station_function}
                        </span>
                      )}
                      {usedByPattern && (
                        <span className="text-[10px] text-red-500 truncate max-w-full">
                          {t('editorTagquest:malusStation.usedByPatternShort')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between gap-3 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={draft == null}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('editorTagquest:malusStation.clear')}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('editorTagquest:malusStation.cancel')}
            </button>
            <button
              type="button"
              disabled={loading || error || (draft != null && patternStationIds.has(draft))}
              onClick={() => {
                onConfirm(draft);
                onClose();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('editorTagquest:malusStation.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
