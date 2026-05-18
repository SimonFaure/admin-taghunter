import { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, X, Package, Film, CheckCheck } from 'lucide-react';
import {
  AdminNotification,
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../lib/adminNotificationsApi';

interface AdminNotificationsListProps {
  onNavigate: (tab: string) => void;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function NotificationIcon({ type }: { type: AdminNotification['type'] }) {
  if (type === 'pattern_created') {
    return (
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-amber-600" />
      </div>
    );
  }
  if (type === 'scenario_created') {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <Film className="w-4 h-4 text-emerald-600" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
      <Bell className="w-4 h-4 text-slate-500" />
    </div>
  );
}

export function AdminNotificationsList({ onNavigate }: AdminNotificationsListProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNotifications = useCallback(async () => {
    const data = await fetchAdminNotifications();
    setNotifications(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();

    intervalRef.current = setInterval(loadNotifications, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification: AdminNotification) => {
    if (!notification.is_read) {
      await markAdminNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    }
    setShowPanel(false);

    const tab = notification.metadata.navigate_to;
    if (tab) {
      onNavigate(tab);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAdminNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div
            className="fixed inset-0 z-[99]"
            onClick={() => setShowPanel(false)}
          />
          <div className="absolute left-full top-0 ml-3 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md transition-all"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>All read</span>
                  </button>
                )}
                <button
                  onClick={() => setShowPanel(false)}
                  className="p-1 hover:bg-slate-200 rounded-md transition-all"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-400 mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-sm font-medium text-slate-500">No notifications yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    You'll be notified when patterns or scenarios are created.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full p-4 text-left hover:bg-slate-50 transition-all flex items-start gap-3 ${
                        !notification.is_read ? 'bg-blue-50/60' : 'bg-white'
                      }`}
                    >
                      <NotificationIcon type={notification.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold leading-tight ${
                            !notification.is_read ? 'text-slate-900' : 'text-slate-700'
                          }`}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {timeAgo(notification.created_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
