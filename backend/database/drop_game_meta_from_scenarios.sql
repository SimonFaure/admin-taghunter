-- Drop the game_meta column from scenarios.
--
-- Background: game_meta originally stored the entire Creator payload alongside
-- parsed columns (data, medias, version, status, scenario_layout, ...). The
-- parsed columns are the canonical source of truth; game_meta was redundant.
-- Verified empty across all rows before drop (NULL or {} JSON).
--
-- Reads were removed in src/components/ScenariosView.tsx (getGameVersion now
-- uses the dedicated `version` column).
-- Writes were removed in backend/api/scenarios.php (create + update branches).

ALTER TABLE scenarios DROP COLUMN game_meta;
