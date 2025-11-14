/*
  # Add media_url field to scenarios table

  1. Changes
    - Add `media_url` column to store the path/URL of the uploaded zip file
    
  2. Notes
    - This field will store the Supabase Storage URL for the uploaded media zip file
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN media_url text;
  END IF;
END $$;