import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown } from 'lucide-react';

export interface Station {
  id: number;
  station_name: string;
  station_function?: string;
}

interface StationSelectProps {
  stations: Station[];
  value: number | null;
  // Station ids already used elsewhere in the same pattern; disabled in the list
  // so a station can only be assigned once per pattern (mirrors the admin editor).
  usedStationKeys: Set<number>;
  onChange: (stationId: number | null) => void;
}

// Clearable + searchable station picker. The dropdown is portaled to <body> so
// it is never clipped by the modal's overflow.
export function StationSelect({ stations, value, usedStationKeys, onChange }: StationSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedStation = useMemo(
    () => (value === null ? null : stations.find((s) => s.id === value) || null),
    [value, stations]
  );

  const filteredStations = useMemo(() => {
    if (!search.trim()) return stations;
    const term = search.toLowerCase();
    return stations.filter(
      (s) => s.station_name.toLowerCase().includes(term) || String(s.id).includes(term)
    );
  }, [stations, search]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    setPos({
      top: openAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    setTimeout(() => inputRef.current?.focus(), 0);

    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const onScroll = () => updatePosition();

    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, updatePosition]);

  const handleSelect = (id: number) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={triggerRef}>
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded cursor-pointer hover:border-slate-300 transition-colors min-w-[180px] text-sm"
      >
        <span className={selectedStation ? 'text-slate-900' : 'text-slate-400'}>
          {selectedStation ? `#${selectedStation.id} - ${selectedStation.station_name}` : 'Select station…'}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {value !== null && (
            <button onClick={handleClear} title="Clear" className="p-0.5 hover:bg-slate-100 rounded transition-colors">
              <X size={14} className="text-slate-400 hover:text-slate-700" />
            </button>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 240) }}
          >
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stations…"
                  className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filteredStations.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No stations found</div>
              ) : (
                filteredStations.map((station) => {
                  const isUsedElsewhere = usedStationKeys.has(station.id) && station.id !== value;
                  const isCurrent = station.id === value;
                  return (
                    <button
                      key={station.id}
                      onClick={() => !isUsedElsewhere && handleSelect(station.id)}
                      disabled={isUsedElsewhere}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isUsedElsewhere
                            ? 'text-slate-300 cursor-not-allowed bg-slate-50'
                            : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <span>
                        #{station.id} - {station.station_name}
                      </span>
                      {isUsedElsewhere && <span className="ml-2 text-xs text-slate-400">(used)</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
