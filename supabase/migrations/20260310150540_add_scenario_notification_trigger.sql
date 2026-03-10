/*
  # Add database trigger for scenario notifications

  ## Purpose
  Automatically creates admin_notifications rows for all admins whenever a new scenario
  is inserted into the scenarios table. This ensures notifications fire regardless of
  whether the scenario is created via the edge function, API, or directly.

  ## How it works
  - A trigger function reads all admin_profiles
  - For each admin, inserts an admin_notifications row with type 'scenario_created'
  - Stores the creator's email/id in metadata for display
  - The trigger fires AFTER INSERT on the scenarios table
*/

CREATE OR REPLACE FUNCTION notify_admins_on_scenario_create()
RETURNS TRIGGER AS $$
DECLARE
  admin_row RECORD;
  creator_email TEXT;
BEGIN
  SELECT email INTO creator_email FROM auth.users WHERE id = NEW.created_by;

  FOR admin_row IN SELECT id FROM public.admin_profiles LOOP
    INSERT INTO public.admin_notifications (
      admin_id,
      type,
      title,
      message,
      metadata,
      is_read
    ) VALUES (
      admin_row.id,
      'scenario_created',
      'New scenario created',
      '"' || NEW.title || '" was created by ' || COALESCE(creator_email, 'a user'),
      jsonb_build_object(
        'creator_email', COALESCE(creator_email, ''),
        'item_id', NEW.id::text,
        'item_name', NEW.title,
        'navigate_to', 'scenarios'
      ),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_scenario_created ON public.scenarios;

CREATE TRIGGER on_scenario_created
  AFTER INSERT ON public.scenarios
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_scenario_create();
