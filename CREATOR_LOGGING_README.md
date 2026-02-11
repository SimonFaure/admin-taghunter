# Creator Logging Setup

This document explains the logging system for Creator API endpoints.

## Database Migration Required

Before the Creator logging feature will work, you need to apply the database migration to add the `source` column to the `api_logs` table.

### Option 1: Using the Migration Script

Run the migration script from the backend directory:

```bash
cd backend
php apply_source_migration.php
```

### Option 2: Manual SQL

Execute the following SQL in your database:

```sql
-- Add source column to api_logs table to differentiate between admin and creator API calls

ALTER TABLE api_logs
ADD COLUMN source VARCHAR(20) DEFAULT 'admin' AFTER status_code,
ADD INDEX idx_source (source);

-- Update existing records to have 'admin' source
UPDATE api_logs SET source = 'admin' WHERE source IS NULL;
```

## How It Works

### Backend Logging

The `Logger::log()` method now accepts an optional 8th parameter `$source` which defaults to `'admin'`:

```php
Logger::log($endpoint, $method, $action, $userId, $data, $response, $statusCode, $source);
```

Creator endpoints now pass `'creator'` as the source:
- `scenarios.php?action=create`
- `scenarios.php?action=upload_media`
- `patterns.php?action=upload`
- `check_email.php`

### Frontend Display

The Logs page now displays a visual badge for Creator logs:
- Orange badge with wrench icon
- Displays next to the HTTP method
- Consistent styling with API Documentation

## Testing

After applying the migration:

1. Make a request to any Creator endpoint (e.g., from Taghunter Creator app)
2. Navigate to the Logs page in the admin interface
3. You should see an orange "Creator" badge on those log entries
4. Compare with regular admin API calls which won't have the badge

## Files Modified

### Backend:
- `backend/utils/Logger.php` - Added source parameter
- `backend/api/scenarios.php` - Added creator logging for create and upload_media actions
- `backend/api/patterns.php` - Added creator logging for upload action
- `backend/api/check_email.php` - Added creator logging for all actions
- `backend/database/add_source_to_api_logs.sql` - Migration file

### Frontend:
- `src/components/LogsView.tsx` - Added Creator badge display
- `src/components/ApiDocsView.tsx` - Added Creator badge in API documentation
