# Client Cards & Devices

Clients upload a CSV of RFID cards through the My Tools page. The CSV lives on disk; the database stores only metadata (version + timestamps). A sibling `devices` table tracks which physical devices are running which cards version.

## Data model

**`client_cards_metadata`** - one row per client

| column      | type      | notes                         |
|-------------|-----------|-------------------------------|
| id          | INT PK    |                               |
| client_id   | INT       | FK → `clients(id)`, UNIQUE    |
| version     | INT       | increments on each upload     |
| created_at  | TIMESTAMP |                               |
| updated_at  | TIMESTAMP |                               |

**`devices`** - one row per registered device

| column              | type      | notes                    |
|---------------------|-----------|--------------------------|
| id                  | INT PK    |                          |
| client_id           | INT       | FK → `clients(id)`       |
| device_uniq         | VARCHAR   | UNIQUE                   |
| playground_version  | VARCHAR   |                          |
| cards_file_version  | INT       |                          |
| created_at          | TIMESTAMP |                          |
| updated_at          | TIMESTAMP |                          |

**Historical fix:** `client_cards_metadata.client_id` was originally `VARCHAR(255)` and needed to be cast to `INT` to join with `clients.id`. If you see silent "no cards file found" errors from a fresh deploy, confirm the column type and that the FK exists.

## File layout

```
cards/
  {client_id}/
    cards_v{version}.csv
```

- One active file per client
- Directory is `.htaccess`-protected and `.gitignore`d
- All reads/writes go through the API - never serve these files directly

## API

Base: [backend/api/cards.php](../backend/api/cards.php), [backend/api/devices.php](../backend/api/devices.php). All endpoints require a valid client session (`$_SESSION['client_id']`). Admin variants use `$_SESSION['user_id']`.

### Cards

| Method | Endpoint                                          | Purpose                                      |
|--------|---------------------------------------------------|----------------------------------------------|
| GET    | `cards.php?action=get_metadata`                   | Current version + whether a file exists      |
| POST   | `cards.php?action=upload` (multipart `file`)      | Validate CSV, save, increment version        |
| GET    | `cards.php?action=download`                       | Stream the CSV                               |
| DELETE | `cards.php?action=delete`                         | Remove file + metadata                       |
| GET    | `cards.php?action=check_filesystem&client_id=…`   | Debug: list files on disk, no DB lookup      |
| GET    | `cards.php?action=debug_metadata[&client_id=…]`   | Debug: compare DB rows vs filesystem         |

### Devices

| Method | Endpoint                                         | Purpose                                      |
|--------|--------------------------------------------------|----------------------------------------------|
| GET    | `devices.php?action=list`                        | All devices for the authenticated client     |
| POST   | `devices.php?action=register`                    | Create/update a device registration          |
| PUT    | `devices.php?action=update`                      | Update device fields                         |
| DELETE | `devices.php?action=delete&device_uniq=…`        | Remove a device                              |

## Troubleshooting

Typical failure mode: CSV exists on disk but the API returns "No cards file found". Cause: missing `client_cards_metadata` row. The API checks the DB first, so an orphaned file is invisible.

**Diagnose**

```bash
cd backend
php check_cards_data.php        # compares DB rows vs files on disk
php quick_check.php              # quick per-client summary
```

Or in the browser:
- `.../backend/api/cards.php?action=check_filesystem&client_id={id}`
- `.../backend/api/cards.php?action=debug_metadata`

**Repair**

```bash
cd backend
php sync_cards_metadata.php      # creates missing metadata rows from files on disk
```

Only runs for clients that exist in the `clients` table. Will also rename files to the `cards_v{n}.csv` convention if they aren't already.

**Logs:** `backend/logs/api_logs.txt`. Frontend logs: open DevTools console and look for `[cardsApi]` and `========== LOADING CARDS ==========` markers.

## Common pitfalls

- **Wrong `client_id`** - the URL path must be `/clients/{id}`; a stale localStorage token can submit the wrong one.
- **Filename/version mismatch** - metadata `version = 2` but file is `cards_v1.csv`. Rename the file or fix the row.
- **Permissions** - `chmod 644` the CSV, `755` the directory.

## Frontend

Cards + devices UI lives in [src/components/client/MyToolsView.tsx](../src/components/client/MyToolsView.tsx). Upload is drag-and-drop `FormData`; download is a `Blob`. Only `.csv` passes the client-side and server-side MIME/extension check.
