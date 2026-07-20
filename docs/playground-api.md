# Pattern API (Playground)

CRUD for game patterns. Used by both the Playground Electron app (authenticated, token-based) and the Creator Electron app (unauthenticated, email-based).

- **Base:** `https://admin.taghunter.fr/backend/api/patterns.php`
- **Source:** [backend/api/patterns.php](../backend/api/patterns.php)
- **Auth (default):** `X-Auth-Token: <token>` header. See [auth.md](auth.md) for how to obtain one.
- **Auth (upload only):** `email` field in the body, resolved against `admin_users` / `clients`. See [creator-integration.md](creator-integration.md) for the Creator flow.

## Visibility rules

- **Admins** see and can modify every pattern.
- **Clients** see default patterns (`owner_type = "system"`) plus their own. Default patterns are read-only for non-admins.
- `is_default: true` is admin-only on both `create` and `update`. 403 otherwise.

## Endpoints

### Create - `POST ?action=create`

Headers: `Content-Type: application/json`, `X-Auth-Token: …`

Required: `name`, `version`, `game_type`, `pattern_data`. Optional: `description`, `is_default`.

`pattern_data` accepts an object or a JSON string; it's stored as a string either way.

```json
{
  "name": "My Custom Pattern",
  "version": "1.0",
  "game_type": "treasure_hunt",
  "description": "…",
  "pattern_data": { "grid_size": 5, "difficulty": "medium" },
  "is_default": false
}
```

201 → `{ success: true, data: { id, name, version, game_type, pattern_data, is_default, owner_type, owner_id, created_by_email, created_at, updated_at } }`

Common 400s: missing `name` / `version` / `game_type` / `pattern_data`, or `Invalid JSON pattern data`.

### List - `GET ?action=list[&game_type=…]`

Returns `{ data: [ … ] }`. Admin → all patterns. Client → defaults + own.

### Get - `GET ?action=get&id={id}`

Returns `{ data: { … } }`. 403 if the client doesn't own it and it isn't a default.

### Update - `POST|PUT ?action=update`

Body: `{ id, …partial fields }`. Non-owners (and non-admins on `is_default`) get 403.

### Delete - `POST|DELETE ?action=delete&id={id}`

Returns `{ success: true, message: "Pattern deleted successfully" }`. Owner-only.

### Upload (Creator) - `POST ?action=upload`

Email-based auth, no token. See [creator-integration.md#upload-pattern](creator-integration.md#upload-pattern) for the contract. 404 `User with this email not found` if the email is in neither `admin_users` nor `clients`.

## Playground workflow

```
POST /auth.php?action=login            → token
GET  /patterns.php?action=list&game_type=treasure_hunt  (X-Auth-Token)
GET  /patterns.php?action=get&id=123   (X-Auth-Token)
POST /patterns.php?action=create       (X-Auth-Token, body)
POST /patterns.php?action=update       (X-Auth-Token, body with id)
DEL  /patterns.php?action=delete&id=123 (X-Auth-Token)
```

## Status codes

200 · 201 (create) · 400 missing/invalid fields · 401 missing/invalid token · 403 permission (ownership or admin-only) · 404 not found · 405 wrong method · 500 server error.

## Debugging 500s

`patterns.php` has hardened error handling: `display_errors` on, a fatal-error shutdown handler, step-by-step logging inside the upload/create case.

### Triage order

1. **Health check** - `GET /patterns.php?action=health` and `GET /default_config.php?action=health`. 500 here = init/require/DB broken. 200 here = issue is specific to the create/upload path.
2. **Diagnostic script** - open `/backend/api/test_patterns_upload.php` in a browser. Reports DB connection, `patterns` table structure, `admin_users` / `clients` presence, file permissions, PHP config.
3. **App logs** - admin Logs view, filter endpoint=`patterns` action=`upload` source=`creator`. Look for the `=== Pattern Upload Started ===` marker and trace which step is missing.
4. **Server logs** - tail Apache/nginx/PHP-FPM error log while triggering the request. Look for fatals, parse errors, memory exhaustion, DB connection errors.
5. **cURL repro** - minimal payload to separate client bugs from server bugs:
   ```bash
   curl -X POST https://admin.taghunter.fr/backend/api/patterns.php?action=upload \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","name":"Test","game_type":"test",
          "pattern_data":{"t":"d"},"version":"1.0","is_default":false}'
   ```

### Log markers

Successful upload trace - if any step is missing from the logs, that's where it died:

```
patterns.php: Starting script execution
patterns.php: Database instance created
patterns.php: Action = upload
=== Pattern Upload Started ===
Request method: POST
Content-Type: application/json
Data retrieved, keys: […]
Looking up user by email: …
User found: admin, ID: …
Converting pattern data to JSON
About to insert pattern: …
Pattern inserted successfully, ID: …
=== Pattern Upload Successful ===
```

Fatals are logged as JSON by the shutdown handler:

```
FATAL ERROR in patterns.php: {"type":1,"message":"…","file":"…","line":123}
```

### Frequent causes

| Symptom                             | Cause                                                  |
|-------------------------------------|--------------------------------------------------------|
| `User with this email not found`    | email missing from both tables                         |
| `Invalid JSON pattern data`         | `pattern_data` string didn't parse                     |
| `patterns table does not exist`     | run `php backend/apply_patterns_migration.php`         |
| Silent 500, memory exhaustion       | `pattern_data` too large - raise `memory_limit` or shrink payload |

### Enhanced error response

The API returns file/line for each error so you can jump straight to the source:

```json
{ "error": "Pattern upload failed: …",
  "details": { "file": "patterns.php", "line": 123 } }
```
