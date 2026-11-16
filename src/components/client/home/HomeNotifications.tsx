import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Film, Download, Gamepad2, Package } from 'lucide-react';
import { notificationsApi } from '../../../lib/notificationsApi';
import { formatDate } from '../../../lib/ordersFormat';
import type { LicenseeNotification, NotificationApp, NotificationsFeed } from '../../../types/notifications';

// Home bell (backend/api/notifications.php): new Tag Hunter scenarios (Playground,
// GO, Spot told apart), new Playground versions (stable vs test channel), newly
// available game types and Tag Hunter's updates on equipment requests.
// Opening the bell marks everything read server-side, for every browser.

export const iconButtonClass =
  'relative flex h-11 w-11 flex-none items-center justify-center rounded-th border border-th-border-strong bg-white text-th-ink2 transition-colors hover:bg-th-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-th-ink';

// Product / channel names: not translated.
const APP_LABEL: Record<NotificationApp, string> = { playground: 'Playground', go: 'GO', spot: 'Spot' };
const APP_PILL: Record<NotificationApp, string> = {
  playground: 'bg-[#EEF0FF] text-[#4C3FD1]',
  go: 'bg-emerald-50 text-emerald-800',
  spot: 'bg-sky-50 text-sky-800',
};
const CHANNEL_PILL = { stable: 'bg-[#E7F6EE] text-[#187A43]', test: 'bg-[#FDF0E3] text-[#A14A06]' } as const;

const TYPE_ICON = {
  scenario: { icon: Film, tile: 'bg-[#EEF0FF] text-[#4C3FD1]' },
  release: { icon: Download, tile: 'bg-[#E7F6EE] text-[#187A43]' },
  game_type: { icon: Gamepad2, tile: 'bg-[#FDF0E3] text-[#A14A06]' },
  order: { icon: Package, tile: 'bg-[#FDECEE] text-[#B42330]' },
} as const;

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

export function HomeNotifications() {
  const { t, i18n } = useTranslation(['home', 'orders']);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [feed, setFeed] = useState<NotificationsFeed | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => notificationsApi.list().then(setFeed).catch(() => setFeed({ items: [], unread_count: 0 })), []);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    // Read now: drop the highlight of the rows that were new.
    setFeed((f) => (f ? { ...f, items: f.items.map((n) => ({ ...n, unread: false })) } : f));
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const toggle = async () => {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    // Refresh, then mark read what is now on screen.
    const fresh = await notificationsApi.list().catch(() => null);
    if (fresh) setFeed(fresh);
    if ((fresh ?? feed)?.unread_count) {
      notificationsApi.markSeen().catch(() => undefined);
      setFeed((f) => (f ? { ...f, unread_count: 0 } : f));
    }
  };

  const unread = feed?.unread_count ?? 0;
  const items = feed?.items ?? [];
  const label = unread > 0 ? `${t('notifications.label')} - ${t('notifications.unread', { count: unread })}` : t('notifications.label');
  // At most "GO" and "Spot" here (a Playground publication has its own wording).
  const appList = (apps: NotificationApp[]) => apps.map((a) => APP_LABEL[a]).join(` ${t('notifications.and')} `);

  const headline = (n: LicenseeNotification): string => {
    switch (n.type) {
      case 'scenario':
        return n.apps.includes('playground')
          ? t('notifications.scenarioPublished', { title: n.title })
          : t('notifications.scenarioInApps', { title: n.title, apps: appList(n.apps) });
      case 'release':
        return t(n.channel === 'test' ? 'notifications.releaseTest' : 'notifications.releaseStable', { version: n.version });
      case 'game_type':
        return t('notifications.gameType', { name: n.name });
      case 'order':
        return n.event === 'status' && n.status
          ? t('notifications.status', { number: n.number, status: t(`orders:status.${n.status}`) })
          : t('notifications.edited', { number: n.number });
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={iconButtonClass}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute right-[11px] top-2.5 h-2 w-2 rounded-full border-2 border-white bg-th-accent" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        role="region"
        aria-label={t('notifications.label')}
        className="absolute right-0 top-full z-30 mt-2 w-[min(380px,calc(100vw-32px))] rounded-th border border-th-border bg-white p-2 shadow-[0_18px_40px_-12px_rgba(15,23,42,.3)]"
      >
        <p className="px-2.5 pb-1 pt-1.5 font-th-display text-base font-semibold text-th-ink">{t('notifications.label')}</p>
        {feed && items.length === 0 && <p className="px-2.5 py-3 text-sm text-th-muted">{t('notifications.empty')}</p>}
        <ul className="max-h-[60vh] overflow-y-auto">
          {items.map((n) => {
            const { icon: Icon, tile } = TYPE_ICON[n.type];
            return (
              <li key={n.key}>
                <Link
                  to={n.link}
                  onClick={() => close(false)}
                  className={`flex min-h-[44px] gap-3 rounded-th-sm px-2.5 py-2.5 hover:bg-th-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-th-ink ${n.unread ? 'bg-th-accent-soft/60' : ''}`}
                >
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-th-sm ${tile}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-semibold leading-snug text-th-ink">
                      {n.unread && <span className="sr-only">{t('notifications.new')} - </span>}
                      {headline(n)}
                    </span>
                    {n.type === 'scenario' && (
                      <span className="flex flex-wrap gap-1">
                        {n.apps.map((a) => (
                          <Pill key={a} className={APP_PILL[a]}>{APP_LABEL[a]}</Pill>
                        ))}
                      </span>
                    )}
                    {n.type === 'release' && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill className={CHANNEL_PILL[n.channel]}>{t(`notifications.channel.${n.channel}`)}</Pill>
                        {n.channel === 'test' && <span className="text-xs text-th-ink2">{t('notifications.releaseTestHint')}</span>}
                      </span>
                    )}
                    {n.type === 'order' && n.note && <span className="line-clamp-2 text-xs text-th-ink2">{n.note}</span>}
                    <span className="text-xs text-th-muted">{formatDate(n.created_at, i18n.language)}</span>
                  </span>
                  {n.unread && <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-none rounded-full bg-th-accent" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
