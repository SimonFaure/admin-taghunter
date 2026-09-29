-- ─────────────────────────────────────────────────────────────────────────────
-- Single licence type: every client is PREMIUM.
--
-- A published product scenario is now available to every Taghunter client
-- (client_scenarios.php `list`, playground.php manifest). The "access" licence
-- (per-scenario playground grants) is no longer sold, and the admin can no
-- longer pick it (clients.php ignores license_type on update, forces premium on
-- create). GO / Spot stay per-client grant rows (client_scenarios.mode = 'go' /
-- 'spot'), added by hand on the admin client page - premium never implies them.
--
-- Safe to re-run on every deploy (apply_all_migrations.php): the licence is no
-- longer editable, so there is no admin choice to clobber. The ENUM keeps its
-- 'access' value so old rows / old app builds never fail to parse.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients ALTER license_type SET DEFAULT 'premium';

UPDATE clients SET license_type = 'premium'
 WHERE license_type IS NULL OR license_type <> 'premium';
