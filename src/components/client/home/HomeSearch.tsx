import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Loader2 } from 'lucide-react';
import { authFetch } from '../../../lib/authFetch';
import { customersApi } from '../../../lib/customersApi';
import type { Customer } from '../../../types/customer';
import type { AppAccess } from '../../../auth/appAccess';
import type { ClientScenario } from '../types';
import { formatDate } from '../../../lib/ordersFormat';
import { gameTypeLabel } from './gameTypeStyle';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MAX_PER_GROUP = 6;

// statistics.php?action=list row (only the fields the search needs).
interface GameRow {
  summary_uuid: string;
  name: string | null;
  scenario_title: string | null;
  scenario_uniqid: string | null;
  played_at: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
}

type Result = { key: string; to: string; title: string; sub?: string };

const norm = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Home top-bar search across the licensee's scenarios (already loaded), their
// customers and their played games (Playground only, loaded on first focus).
// Ctrl/Cmd+K focuses it from anywhere on the page.
export function HomeSearch({ scenarios, access }: { scenarios: ClientScenario[]; access: AppAccess }) {
  const { t, i18n } = useTranslation('home');
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [games, setGames] = useState<GameRow[] | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const ensureLoaded = () => {
    if (requested.current || !access.playground) return;
    requested.current = true;
    customersApi.list().then(setCustomers).catch(() => setCustomers([]));
    authFetch(`${API_BASE_URL}/statistics.php?action=list&limit=300`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setGames(Array.isArray(b?.games) ? b.games : []))
      .catch(() => setGames([]));
  };

  const term = norm(q.trim());
  const groups = useMemo(() => {
    if (!term) return [];
    const out: { key: string; label: string; items: Result[]; loading: boolean }[] = [];
    out.push({
      key: 'scenarios',
      label: t('search.scenarios'),
      loading: false,
      items: scenarios
        .filter((s) => norm(s.title).includes(term))
        .slice(0, MAX_PER_GROUP)
        .map((s) => ({ key: `s${s.id}`, to: s.uniqid ? `/my/scenarios/${s.uniqid}` : '/my/scenarios', title: s.title, sub: gameTypeLabel(s.game_type) })),
    });
    if (access.playground) {
      out.push({
        key: 'customers',
        label: t('search.customers'),
        loading: customers === null,
        items: (customers || [])
          .filter((c) => [c.name, c.city, c.contact_name, c.email].some((f) => norm(f).includes(term)))
          .slice(0, MAX_PER_GROUP)
          .map((c) => ({ key: `c${c.id}`, to: `/my/customers/${c.id}`, title: c.name, sub: c.city || c.contact_name || undefined })),
      });
      out.push({
        key: 'games',
        label: t('search.games'),
        loading: games === null,
        items: (games || [])
          .filter((g) => [g.name, g.scenario_title, g.customer_name].some((f) => norm(f).includes(term)))
          .slice(0, MAX_PER_GROUP)
          .map((g) => {
            // statistics.php falls back to the bare uniqid when the scenario row is gone.
            const scenarioTitle = g.scenario_title && g.scenario_title !== g.scenario_uniqid ? g.scenario_title : null;
            return {
            key: `g${g.summary_uuid}`,
            // A game opens its customer's history when it has one, else the statistics page.
            to: g.customer_id ? `/my/customers/${g.customer_id}` : '/my/statistics',
            title: g.name || scenarioTitle || '',
            sub: [formatDate(g.played_at, i18n.language), g.customer_name, g.name ? scenarioTitle : null]
              .filter(Boolean)
              .join(' · '),
            };
          }),
      });
    }
    return out;
  }, [term, scenarios, customers, games, access.playground, t, i18n.language]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const pending = groups.some((g) => g.loading);
  const showPanel = open && term.length > 0;

  const links = () => Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-result]') || []);
  const close = () => {
    setOpen(false);
    inputRef.current?.focus();
  };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && showPanel) {
      e.preventDefault();
      links()[0]?.focus();
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      setOpen(false);
    }
  };
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = links();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[Math.min(i + 1, all.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) inputRef.current?.focus();
      else all[i - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const picked = () => {
    setOpen(false);
    setQ('');
  };

  return (
    // Base 200px (not the mockup's 280) so search + the two icon buttons share one row at 390px.
    <div ref={rootRef} className="relative min-w-0 flex-[1_1_200px] max-w-[480px]">
      <label className="flex h-11 items-center gap-2.5 rounded-th border border-th-border-strong bg-white px-3.5 text-th-muted focus-within:border-th-ink focus-within:ring-2 focus-within:ring-th-ink/15">
        <Search className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
        <span className="sr-only">{t('search.label')}</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            ensureLoaded();
            setOpen(true);
          }}
          onKeyDown={onInputKey}
          placeholder={t('search.placeholder')}
          aria-expanded={showPanel}
          aria-controls={panelId}
          autoComplete="off"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-th-ink outline-none placeholder:text-th-muted"
        />
        <kbd className="hidden rounded-md border border-th-border-strong px-1.5 py-0.5 font-th-body text-xs text-th-muted sm:inline">
          {t('search.shortcut')}
        </kbd>
      </label>

      <p className="sr-only" aria-live="polite">
        {showPanel && !pending ? t('search.resultsCount', { count: total }) : ''}
      </p>

      <div
        id={panelId}
        ref={panelRef}
        hidden={!showPanel}
        onKeyDown={onPanelKey}
        className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-th border border-th-border bg-white p-2 shadow-[0_18px_40px_-12px_rgba(15,23,42,.3)]"
      >
        {groups.map((g) =>
          g.items.length === 0 && !g.loading ? null : (
            <div key={g.key} className="py-1">
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-th-muted">{g.label}</p>
              {g.loading && g.items.length === 0 ? (
                <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-th-muted">
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  {t('search.loading')}
                </p>
              ) : (
                g.items.map((r) => (
                  <Link
                    key={r.key}
                    to={r.to}
                    data-result
                    onClick={picked}
                    className="flex min-h-[44px] flex-col justify-center rounded-th-sm px-2.5 py-1.5 hover:bg-th-bg focus-visible:bg-th-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-th-ink"
                  >
                    <span className="text-sm font-semibold text-th-ink">{r.title}</span>
                    {r.sub && <span className="text-xs text-th-muted">{r.sub}</span>}
                  </Link>
                ))
              )}
            </div>
          ),
        )}
        {total === 0 && !pending && (
          <p className="px-2.5 py-3 text-sm text-th-muted">{t('search.noResults', { q: q.trim() })}</p>
        )}
      </div>
    </div>
  );
}
