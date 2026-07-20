# Creator ↔ Admin API

Contract between the Taghunter Creator desktop app and the admin-taghunter PHP backend.

- **Base URL (prod):** `https://admin.taghunter.fr/backend/api`
- **Auth:** email-based. Every Creator request includes an `email` field; the backend resolves it against `admin_users` (→ admin) or `clients` (→ client) and enforces ownership.
- **Response envelope:** `{ success: true, data: …, message: … }` on success; `{ error: "…", details: { file, line } }` on failure.

Admin emails get full access; client emails can only touch their own resources.

## Endpoints

### Check user

`GET /check_email.php?email={email}` - public. Returns `{ exists, is_admin, client_id? | admin_id? }`. Creator uses this to gate login.

### Create/update scenario

`POST /scenarios.php?action=create` (multipart/form-data)

Fields: `email`, `scenarioData` (stringified JSON with `title`, `description`, `uniqid`, `game_type`, `scenario_type`, `scenario_layout`, `data`, `media`).

- `uniqid` is the idempotency key - an existing scenario with the same `uniqid` is **updated**, not duplicated.
- Response `data` includes `is_taghunter_product: true` when the creating email is an admin (`client_id` stored as `NULL`); otherwise it's a custom client scenario. See [product-scenarios.md](product-scenarios.md) for classification details.

### Upload scenario files

`POST /scenario_files.php?action=upload` (multipart/form-data)

Fields: `email`, `scenario_id`, `name`, `file`. Stored at `/media/{scenario_uniqid}/files/{sanitized}`. 50 MB max. Filename sanitisation prevents traversal.

### Upload scenario media + get public URL

`POST /scenarios.php?action=upload_media` (multipart/form-data)

Fields: `email`, `uniqid`, `file`. Stored at `/media/{scenario_uniqid}/{original}`. Response includes `url` for embedding in the scenario's `media` object.

### Upload pattern

`POST /patterns.php?action=upload` (application/json)

Body: `{ email, name, game_type, pattern_data, version, is_default? }`. `is_default: true` is admin-only (403 otherwise). `pattern_data` accepts an object or a JSON string - stored as string.

For the full authenticated Pattern API (create/list/get/update/delete), see [playground-api.md](playground-api.md).

### List clients (admin only)

`GET /clients.php?action=creator_list&email={admin_email}` → 403 for client emails.

### Create/update default config (admin only)

`POST /default_config.php?action=create` (application/json)

Body: `{ user_email, meta, version, value }` where `value` must be an object or array. Session or `X-Auth-Token` header. Auto-versions: reusing the same `meta` updates and increments `version`.

## Quick reference

| Action                    | Endpoint                                  | Method | Auth          |
|---------------------------|-------------------------------------------|--------|---------------|
| Check user                | `check_email.php`                         | GET    | none          |
| Create/update scenario    | `scenarios.php?action=create`             | POST   | email         |
| Upload scenario file      | `scenario_files.php?action=upload`        | POST   | email         |
| Upload scenario media     | `scenarios.php?action=upload_media`       | POST   | email         |
| Upload pattern            | `patterns.php?action=upload`              | POST   | email         |
| List clients              | `clients.php?action=creator_list`         | GET    | email (admin) |
| Default config            | `default_config.php?action=create`        | POST   | email (admin) + token |
| Health                    | `{endpoint}.php?action=health`            | GET    | none          |

## Status codes

200 OK · 201 Created · 400 bad/missing fields · 401 unauthorised · 403 forbidden (ownership or admin-only) · 404 not found · 405 wrong method · 500 server error.

Always check *both* `response.ok` and `result.success` - error responses still parse as JSON.

## Logging

Every Creator-originated request passes `'creator'` as the 8th arg of `Logger::log(...)`. The admin Logs view highlights these with an orange "Creator" badge.

Relevant code:
- [backend/utils/Logger.php](../backend/utils/Logger.php) - `log()` signature
- [src/components/LogsView.tsx](../src/components/LogsView.tsx) - badge rendering

The migration that added the `source` column is applied via `backend/apply_source_migration.php`, or manually:

```sql
ALTER TABLE api_logs
  ADD COLUMN source VARCHAR(20) DEFAULT 'admin' AFTER status_code,
  ADD INDEX idx_source (source);
UPDATE api_logs SET source = 'admin' WHERE source IS NULL;
```

## Debugging 500s on upload

Both `patterns.php` and `default_config.php` have hardened error handling: `display_errors` on, a shutdown handler that logs fatals as JSON, and per-step logging inside the upload/create case.

**Order of triage:**

1. **Health check** - `GET /patterns.php?action=health` and `GET /default_config.php?action=health`. A 500 here means init/require/DB is broken; a 200 means the issue is specific to the create/upload path.
2. **Diagnostic script** - open `/backend/api/test_patterns_upload.php` in a browser. Checks DB connection, required tables, file permissions, PHP config.
3. **App logs** - admin Logs view, filter endpoint=`patterns`, source=`creator`. Look for the `=== Pattern Upload Started ===` marker and trace which step is missing from the log.
4. **Server logs** - Apache/nginx/PHP-FPM error log for fatal errors, memory exhaustion, DB connection errors.
5. **cURL repro** - reproduce with a minimal payload to separate Creator bugs from backend bugs.

### Frequent causes

| Symptom                                    | Cause                                                    |
|--------------------------------------------|----------------------------------------------------------|
| `User with this email not found`           | email missing from both `admin_users` and `clients`      |
| `Invalid JSON pattern data`                | `pattern_data` string didn't parse                       |
| `User is not an admin` (on default_config) | client email used on an admin-only endpoint              |
| `patterns table does not exist`            | migration not run - `php backend/apply_patterns_migration.php` |
| Silent memory exhaustion                   | oversized `pattern_data` - raise `memory_limit` or shrink |

### Breaking changes (historical)

- `userEmail` parameter renamed to `email` everywhere.
- `scenario_files.php` now requires `email`.
- Response field renamed: `result.scenario` / `result.file` → `result.data`.
- All success responses now carry a `message`.

If you hit 401/403 from old Creator builds, they're probably still sending `userEmail`.
