-- Backfill `game_meta.adaptable_spot` on scenarios that are ALREADY granted as
-- Spot (a `client_scenarios` row with mode='spot').
--
-- WHY: go.php's `load` used to gate BOTH apps on `adaptable_go`, even after Spot
-- got its own editor toggle (`adaptable_spot`, added 2026-07-15). That gate is
-- now app-correct - Spot requires `adaptable_spot`. Without this backfill, any
-- scenario granted as Spot before an admin re-opened it in the editor would
-- start refusing with `not_spot` the moment the new go.php ships, even though it
-- plays fine today. An explicit Spot GRANT is the admin saying "this scenario is
-- a Spot scenario", so we honour it.
--
-- ONLY fills the key when it is ABSENT. The editor writes `adaptable_spot: false`
-- explicitly when the toggle is unticked, so a present-but-false flag is a
-- deliberate choice and is left alone. That also makes this idempotent: after one
-- pass the key exists, so nothing matches on a re-run.
--
-- Two statements because game_meta lives at one of two nestings, exactly as
-- go.php reads it: `data.game_meta` (current) or `data.data.game_meta` (legacy).
-- JSON_SET only creates a key whose PARENT path exists, so each statement is
-- guarded on its own parent.
--
-- Matches mode IN ('spot','drop') so this file is order-independent: the
-- apply_all runner globs *.sql alphabetically and would otherwise run it BEFORE
-- rename_drop_to_spot.sql has remapped the mode values, finding nothing.

UPDATE scenarios s
   SET s.data = JSON_SET(s.data, '$.game_meta.adaptable_spot', TRUE)
 WHERE JSON_CONTAINS_PATH(s.data, 'one', '$.game_meta')
   AND NOT JSON_CONTAINS_PATH(s.data, 'one', '$.game_meta.adaptable_spot')
   AND EXISTS (
       SELECT 1 FROM client_scenarios cs
        WHERE cs.scenario_id = s.id AND cs.mode IN ('spot', 'drop')
   );

UPDATE scenarios s
   SET s.data = JSON_SET(s.data, '$.data.game_meta.adaptable_spot', TRUE)
 WHERE NOT JSON_CONTAINS_PATH(s.data, 'one', '$.game_meta')
   AND JSON_CONTAINS_PATH(s.data, 'one', '$.data.game_meta')
   AND NOT JSON_CONTAINS_PATH(s.data, 'one', '$.data.game_meta.adaptable_spot')
   AND EXISTS (
       SELECT 1 FROM client_scenarios cs
        WHERE cs.scenario_id = s.id AND cs.mode IN ('spot', 'drop')
   );
