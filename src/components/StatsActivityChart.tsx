import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

// Per-day activity chart for the statistics page, fed by
// statistics.php?action=timeseries (one row per day × game type). The mode
// switcher re-shapes the same dataset: total games/day, total teams/day, or
// games/day stacked by game type.

export interface TimeseriesRow {
  date: string; // YYYY-MM-DD
  game_type: string;
  games: number;
  teams: number;
}

type ChartMode = 'games' | 'teams' | 'types';

// Categorical slots in fixed order (CVD-validated); types beyond 8 fold into
// a gray "Other". Slots are assigned from the scope-wide game-type list, not
// the filtered rows, so a type keeps its color when filters change.
const SERIES_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const OTHER_COLOR = '#898781';
const OTHER_KEY = '__other__';
const SINGLE_COLOR: Record<'games' | 'teams', string> = { games: '#2a78d6', teams: '#1baf7a' };

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The day list the x-axis shows: the from/to filter range when set, otherwise
// the last 30 days (matching the backend's default window).
function dayRange(from: string, to: string): string[] {
  const end = to ? new Date(to + 'T00:00:00') : new Date(new Date().setHours(0, 0, 0, 0));
  const start = from ? new Date(from + 'T00:00:00') : (() => { const d = new Date(end); d.setDate(d.getDate() - 29); return d; })();
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end && days.length < 731) {
    days.push(isoDay(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

interface TooltipEntry { dataKey?: string | number; name?: string; value?: number; color?: string }
function ChartTooltip({ active, payload, label, lang, showTotal }: {
  active?: boolean; payload?: TooltipEntry[]; label?: string; lang: string; showTotal: boolean;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const items = payload.filter((p) => (p.value ?? 0) > 0);
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-slate-900 mb-1">
        {new Date(label + 'T00:00:00').toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {items.length === 0 ? (
        <p className="text-slate-500">0</p>
      ) : items.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-600 capitalize">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">{(p.value ?? 0).toLocaleString(lang)}</span>
        </div>
      ))}
      {showTotal && items.length > 1 && (
        <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-slate-100">
          <span className="text-slate-600">Total</span>
          <span className="font-semibold text-slate-900 tabular-nums">{total.toLocaleString(lang)}</span>
        </div>
      )}
    </div>
  );
}

export function StatsActivityChart({ rows, allGameTypes, from, to }: {
  rows: TimeseriesRow[];
  allGameTypes: string[];
  from: string;
  to: string;
}) {
  const { t, i18n } = useTranslation('statistics');
  const [mode, setMode] = useState<ChartMode>('games');

  const days = useMemo(() => dayRange(from, to), [from, to]);

  // Stable color slots over the caller's whole scope (+ any type only present
  // in the rows, appended), independent of the active filters.
  const typeSlots = useMemo(() => {
    const slots = new Map<string, number>();
    for (const gt of allGameTypes) if (!slots.has(gt)) slots.set(gt, slots.size);
    for (const r of rows) if (!slots.has(r.game_type)) slots.set(r.game_type, slots.size);
    return slots;
  }, [allGameTypes, rows]);

  const { data, seriesKeys, hasData } = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const d of days) byDay.set(d, {});
    const present = new Set<string>();
    let any = false;

    for (const r of rows) {
      const bucket = byDay.get(r.date);
      if (!bucket) continue;
      const value = mode === 'teams' ? r.teams : r.games;
      const key = mode === 'types'
        ? ((typeSlots.get(r.game_type) ?? 99) < SERIES_COLORS.length ? r.game_type : OTHER_KEY)
        : 'value';
      bucket[key] = (bucket[key] ?? 0) + value;
      present.add(key);
      if (value > 0) any = true;
    }

    const keys = mode === 'types'
      ? [...typeSlots.keys()].filter((gt) => present.has(gt) && (typeSlots.get(gt) ?? 99) < SERIES_COLORS.length)
          .concat(present.has(OTHER_KEY) ? [OTHER_KEY] : [])
      : ['value'];

    const chartData = days.map((d) => ({ ...byDay.get(d), date: d }));
    return { data: chartData, seriesKeys: keys, hasData: any };
  }, [days, rows, mode, typeSlots]);

  const colorOf = (key: string) =>
    key === 'value' ? SINGLE_COLOR[mode === 'teams' ? 'teams' : 'games']
    : key === OTHER_KEY ? OTHER_COLOR
    : SERIES_COLORS[typeSlots.get(key) ?? 0];

  const nameOf = (key: string) =>
    key === 'value' ? t(`chart.modes.${mode === 'teams' ? 'teams' : 'games'}`)
    : key === OTHER_KEY ? t('chart.other')
    : key;

  const stacked = mode === 'types';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-slate-700" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('chart.title')}</h3>
            {!from && !to && <p className="text-xs text-slate-500">{t('chart.last30')}</p>}
          </div>
        </div>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm" role="group">
          {(['games', 'teams', 'types'] as ChartMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {t(`chart.modes.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-72 flex items-center justify-center text-sm text-slate-500">{t('chart.empty')}</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={288}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} minTickGap={28}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(d: string) => new Date(d + 'T00:00:00').toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36}
                tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} isAnimationActive={false}
                content={<ChartTooltip lang={i18n.language} showTotal={stacked} />} />
              {seriesKeys.map((key, i) => (
                <Bar key={key} dataKey={key} name={nameOf(key)} fill={colorOf(key)}
                  stackId={stacked ? 'day' : undefined}
                  stroke={stacked ? '#ffffff' : undefined} strokeWidth={stacked ? 1 : 0}
                  radius={i === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={40} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {stacked && seriesKeys.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {seriesKeys.map((key) => (
                <span key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-600 capitalize">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(key) }} />
                  {nameOf(key)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
