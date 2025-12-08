/*
  # Create notifications table

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key) - Unique notification identifier
      - `client_id` (uuid) - Reference to the client
      - `type` (text) - Notification type (e.g., 'app_installation_request')
      - `title` (text) - Notification title
      - `message` (text) - Notification message
      - `is_read` (boolean) - Whether notification has been read
      - `metadata` (jsonb) - Additional metadata for the notification
      - `created_at` (timestamptz) - When notification was created
      - `updated_at` (timestamptz) - When notification was last updated

  2. Security
    - Enable RLS on `notifications` table
    - Add policy for authenticated admins to read all notifications
    - Add policy for authenticated admins to update notification status
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated admins can read all notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admins can update notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Edge functions can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);