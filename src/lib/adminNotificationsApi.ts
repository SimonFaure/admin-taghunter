const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface AdminNotification {
  id: number;
  type: 'pattern_created' | 'scenario_created' | 'general';
  title: string;
  message: string;
  is_read: boolean;
  metadata: {
    creator_email?: string;
    creator_name?: string;
    item_id?: number | string;
    item_name?: string;
    navigate_to?: string;
  };
  created_at: string;
}

export async function fetchAdminNotifications(): Promise<AdminNotification[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin_notifications.php?action=list`, {
      credentials: 'include',
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.notifications || [];
  } catch {
    return [];
  }
}

export async function markAdminNotificationRead(id: number): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/admin_notifications.php?action=mark_read`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch {
    // silent
  }
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/admin_notifications.php?action=mark_all_read`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // silent
  }
}

export async function broadcastAdminNotification(
  type: AdminNotification['type'],
  title: string,
  message: string,
  metadata: AdminNotification['metadata']
): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/admin_notifications.php?action=create`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, message, metadata }),
    });
  } catch {
    // silent
  }
}
