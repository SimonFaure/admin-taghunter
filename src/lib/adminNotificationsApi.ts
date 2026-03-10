import { supabase } from './supabase';

export interface AdminNotification {
  id: string;
  admin_id: string;
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
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching admin notifications:', error);
    return [];
  }

  return data || [];
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('admin_notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) {
    console.error('Error marking notification as read:', error);
  }
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('admin_notifications')
    .update({ is_read: true })
    .eq('admin_id', user.id)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
  }
}

export async function broadcastAdminNotification(
  type: AdminNotification['type'],
  title: string,
  message: string,
  metadata: AdminNotification['metadata'],
  excludeAdminId?: string
): Promise<void> {
  if (!supabase) return;

  const { data: admins, error: adminsError } = await supabase
    .from('admin_profiles')
    .select('id');

  if (adminsError || !admins) {
    console.error('Error fetching admin profiles:', adminsError);
    return;
  }

  const targetAdmins = excludeAdminId
    ? admins.filter((a) => a.id !== excludeAdminId)
    : admins;

  if (targetAdmins.length === 0) return;

  const rows = targetAdmins.map((admin) => ({
    admin_id: admin.id,
    type,
    title,
    message,
    metadata,
    is_read: false,
  }));

  const { error } = await supabase.from('admin_notifications').insert(rows);

  if (error) {
    console.error('Error inserting admin notifications:', error);
  }
}
