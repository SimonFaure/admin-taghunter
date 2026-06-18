-- Migration: enable/disable game types (global + per-client)
-- Description: Adds an `enabled` flag to the global game_types registry and to the
--              per-client override table. Allow-by-default denylist semantics:
--              global enabled defaults to 1; the per-client flag is NULL (= inherit
--              = allowed) and only set to 0 to disable a type for one client.
--              Effective availability = (global enabled) AND (client not disabled).
--              Seeds `clash` as globally disabled (no playground runtime yet).
-- Date: 2026-06-16

ALTER TABLE game_types
  ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE client_game_type_overrides
  ADD COLUMN enabled TINYINT(1) NULL DEFAULT NULL;

UPDATE game_types SET enabled = 0 WHERE code = 'clash';
