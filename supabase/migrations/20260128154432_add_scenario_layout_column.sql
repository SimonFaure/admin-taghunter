/*
  # Add scenario_layout Column to Scenarios Table

  1. Changes
    - Add `scenario_layout` column (jsonb) - stores layout information for interactive elements
    
  2. Purpose
    - Store positions and sizes of interactive elements/hotspots relative to background image
    - Layout data structure: array of elements with properties like:
      - id: unique identifier
      - type: element type (e.g., 'hotspot', 'button', 'zone')
      - x, y: position relative to background (percentage or pixels)
      - width, height: dimensions (percentage or pixels)
      - label: optional label for the element
      
  3. Migration Safety
    - Uses IF EXISTS/NOT EXISTS to prevent errors
    - Non-destructive approach
    - Default empty JSON object
*/

-- Add scenario_layout column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'scenarios'
    AND column_name = 'scenario_layout'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN scenario_layout jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;