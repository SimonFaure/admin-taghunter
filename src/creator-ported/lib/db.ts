import { createDbAdapter } from './db-adapter';

// PhpQueryBuilder shim over /backend/api/query.php + /backend/api/media.php.
// Passing `null` keeps createDbAdapter on the web-app path, the only path studio uses.
export const db = createDbAdapter(null);
