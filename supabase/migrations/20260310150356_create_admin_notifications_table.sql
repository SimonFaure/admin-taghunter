/*
  # Create admin_notifications table

  ## Purpose
  Stores notifications scoped per-admin, triggered when patterns or scenarios are created.
  Each admin gets their own notification row so they can independently track read/unread state.

  ## New Tables
  - `admin_notifications`
    - `id` (uuid, primary key)
    - `admin_id` (uuid) - references auth.users, the admin who receives this notification
    - `type` (text) - 'pattern_created' or 'scenario_created'
    - `title` (text) - short notification title
    - `message` (text) - full notification message including creator info
    - `is_read` (boolean, default false)
    - `metadata` (jsonb) - extra info: creator_email, creator_name, item_id, item_name
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admins can read their own notifications (admin_id = auth.uid())
  - Admins can update (mark read) their own notifications
  - Any authenticated admin can insert notifications (needed to fan-out to all admins on create)

  ## Notes
  - No foreign key to admin_profiles to avoid coupling; admin_id matches auth.users.id
  - Separate row per admin allows independent read tracking
*/

CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own notifications"
  ON admin_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = admin_id);

CREATE POLICY "Admins can update own notifications"
  ON admin_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Authenticated users can insert admin notifications"
  ON admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can delete own notifications"
  ON admin_notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = admin_id);

CREATE INDEX IF NOT EXISTS admin_notifications_admin_id_idx ON admin_notifications (admin_id);
CREATE INDEX IF NOT EXISTS admin_notifications_is_read_idx ON admin_notifications (admin_id, is_read);
CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON admin_notifications (created_at DESC);
