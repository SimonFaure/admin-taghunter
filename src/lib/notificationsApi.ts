// Client for backend/api/notifications.php (licensee home bell).
import { authFetch } from './authFetch';
import type { NotificationsFeed } from '../types/notifications';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const ENDPOINT = `${API_BASE_URL}/notifications.php`;

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export const notificationsApi = {
  list: () => authFetch(`${ENDPOINT}?action=list`).then((r) => handle<NotificationsFeed>(r)),
  /** Everything up to now becomes read, for every browser of the account. */
  markSeen: () => authFetch(`${ENDPOINT}?action=mark_seen`, { method: 'POST' }).then((r) => handle<{ success: boolean }>(r)),
};
