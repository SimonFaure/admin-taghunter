import { createDbAdapter } from './db-adapter';

// `supabase` here is a historical export name; it's actually the PhpQueryBuilder
// shim over /backend/api/query.php + /backend/api/media.php. Passing `null` keeps
// createDbAdapter on the web-app path (PhpQueryBuilder), the only path studio uses.
// Renaming this export is deferred to Phase 5 — 60+ call sites import `{ supabase }`.
export const supabase = createDbAdapter(null);
