/**
 * Purge-station picker (Clash) - the client's si_balises inventory as square,
 * single-select cards. Same design and rules as the malus-station picker in the
 * other editors: pick the balise from the inventory instead of typing a number
 * that nothing validates (which is how authors kept handing the purge station to
 * a territory - retours #50).
 *
 * Two deliberate differences from that picker, both forced by Clash's own
 * conventions:
 *
 *  - the stored value is the station NUMBER (`Number(si_balises.station_name)`),
 *    NOT the `si_balises.id` - the playground resolves numbers → ids at launch
 *    via `station_ids_by_number` (see BalisePickerModal);
 *  - a station already used by a territory is disabled: one physical punch
 *    cannot both validate a territory and fire the purge.
 *
 * There is no "clear": a blank purge station falls back to the historic 25
 * everywhere downstream, so the field always holds a number.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search, X } from 'lucide-react';
import type { StationRow } from '../useClashStations';

interface PurgeStationPickerModalProps {
  stations: StationRow[];
  loading: boolean;
  error: boolean;
  /** Currently stored purge station (station NUMBER). */
  selected: number | null;
  /** Station number → label of the territory already using it. Not selectable. */
  usedBy: Map<number, string>;
  /** Receives the picked station number. */
  onConfirm: (station: number) => void;
  onClose: () => void;
}

interface CardModel {
  key: string;
  /** null = non-numeric station_name (cannot be stored as a purge station). */
  number: number | null;
  label: string;
  func: string | null;
  /** Stored number with no matching inventory row (legacy / other client). */
  unknown: boolean;
}

const SEARCH_THRESHOLD = 20;

export function PurgeStationPickerModal({
  stations,
  loading,
  error,
  selected,
  usedBy,
  onConfirm,
  onClose,
}: PurgeStationPickerModalProps) {
  const { t } = useTranslation();
  // Mounted only while open, so init-once is safe; Cancel/backdrop discards.
  const [draft, setDraft] = useState<number | null>(selected);
  const [query, setQuery] = useState('');

  const cards = useMemo<CardModel[]>(() => {
    const numeric: CardModel[] = [];
    const nonNumeric: CardModel[] = [];
    const seen = new Set<number>();
    for (const s of stations) {
      const name = (s.station_name ?? '').trim();
      const num = Number(name);
      if (name !== '' && Number.isInteger(num) && num >= 0) {
        // Two inventory rows sharing a number would be ambiguous to pick -
        // keep the first (lowest id, rows arrive ordered by id).
        if (seen.has(num)) continue;
        seen.add(num);
        numeric.push({
          key: `n${num}`,
          number: num,
          label: name,
          func: s.station_function || null,
          unknown: false,
        });
      } else {
        nonNumeric.push({
          key: `id${s.id}`,
          number: null,
          label: name || '?',
          func: s.station_function || null,
          unknown: false,
        });
      }
    }
    numeric.sort((a, b) => a.number! - b.number!);
    nonNumeric.sort((a, b) => a.label.localeCompare(b.label));
    // The stored number when it isn't in the inventory (legacy scenario, or a
    // scenario copied between clients): shown so the author can see and replace
    // it rather than losing it silently.
    const unknown: CardModel[] =
      draft !== null && !seen.has(draft)
        ? [{ key: `u${draft}`, number: draft, label: String(draft), func: null, unknown: true }]
        : [];
    return [...numeric, ...unknown, ...nonNumeric];
  }, [stations, draft]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.func ?? '').toLowerCase().includes(q),
    );
  }, [cards, query]);

  const showSearch = !loading && !error && stations.length >= SEARCH_THRESHOLD;
  const emptyInventory = !loading && !error && cards.length === 0;
  const draftBlocked = draft !== null && usedBy.has(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {t('editorClash:purge.pickerTitle')}
            </h3>
            <p className="text-xs text-gray-500">{t('editorClash:purge.pickerHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            aria-label={t('editorClash:territories.cancel')}
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
                placeholder={t('editorClash:territories.pickerSearchPlaceholder')}
                className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">{t('editorClash:territories.pickerLoading')}</p>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">{t('editorClash:territories.pickerError')}</p>
          ) : emptyInventory ? (
            <p className="text-sm text-gray-500 text-center py-8">{t('editorClash:territories.pickerEmpty')}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {visible.map((c) => {
                if (c.number === null) {
                  return (
                    <div
                      key={c.key}
                      className="aspect-square rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-1 text-center opacity-60"
                      title={t('editorClash:territories.notNumeric')}
                    >
                      <span className="text-sm font-semibold text-gray-500 truncate max-w-full">{c.label}</span>
                      {c.func && <span className="text-[10px] text-gray-400 truncate max-w-full">{c.func}</span>}
                      <span className="text-[10px] text-gray-400 mt-0.5">{t('editorClash:territories.notNumeric')}</span>
                    </div>
                  );
                }
                const num = c.number;
                const isSelected = draft === num;
                // A territory's balise can never become the purge station. It
                // stays visible (and flagged) when it IS the stored value, so a
                // legacy collision can be seen and fixed here.
                const usedLabel = usedBy.get(num);
                const disabled = usedLabel !== undefined && !isSelected;
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDraft(num)}
                    title={
                      usedLabel !== undefined
                        ? t('editorClash:territories.usedByTerritory', { territory: usedLabel })
                        : c.unknown
                          ? t('editorClash:territories.unknownStation')
                          : undefined
                    }
                    className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-colors ${
                      disabled
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? usedLabel !== undefined
                            ? 'border-2 border-red-500 bg-red-50'
                            : c.unknown
                              ? 'border-2 border-amber-500 bg-amber-50'
                              : 'border-2 border-blue-600 bg-blue-50'
                          : 'border-gray-300 bg-white hover:border-blue-400'
                    }`}
                  >
                    {isSelected && (
                      <span
                        className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center ${
                          usedLabel !== undefined ? 'bg-red-500' : c.unknown ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                    <span
                      className={`text-2xl font-bold ${
                        disabled
                          ? 'text-gray-400'
                          : usedLabel !== undefined && isSelected
                            ? 'text-red-700'
                            : c.unknown
                              ? 'text-amber-700'
                              : 'text-gray-900'
                      }`}
                    >
                      {c.label}
                    </span>
                    {c.func && <span className="text-[10px] text-gray-500 truncate max-w-full">{c.func}</span>}
                    {c.unknown && (
                      <span className="text-[10px] text-amber-600 truncate max-w-full">
                        {t('editorClash:territories.unknownStation')}
                      </span>
                    )}
                    {usedLabel !== undefined && (
                      <span className="text-[10px] text-gray-400 truncate max-w-full">
                        {t('editorClash:territories.usedByTerritory', { territory: usedLabel })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('editorClash:territories.cancel')}
          </button>
          <button
            type="button"
            disabled={loading || error || emptyInventory || draft === null || draftBlocked}
            onClick={() => {
              if (draft === null) return;
              onConfirm(draft);
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('editorClash:territories.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
