# Email-Based Scenario Management

## Overview
Scenarios are now associated with users via their email address, simplifying authorization and reducing database complexity.

## Database Schema

### Scenarios Table
The `scenarios` table now includes an `email` column that stores the email address of the scenario owner:

```sql
ALTER TABLE scenarios
ADD COLUMN email VARCHAR(255) NULL AFTER client_id,
ADD INDEX idx_email (email);
```

## How It Works

### Creating Scenarios from Creator App

When a scenario is published from the Creator app:

1. **Email Validation**: The system validates the email exists in either `admin_users` or `clients` table
2. **ID Assignment**: Based on the email lookup:
   - If email belongs to a **client**:
     - Sets `client_id` to the client's ID
     - Sets `created_by` to NULL
     - Stores `email` in the email column
   - If email belongs to an **admin**:
     - Sets `client_id` to NULL (makes it a Taghunter Product)
     - Sets `created_by` to the admin's ID
     - Stores `email` in the email column

3. **Rejection**: If email doesn't exist in either table, the request is rejected with a 404 error

### Authorization

Authorization checks are simplified by using the stored email:

- **Ownership Check**: Compare the requesting email with `scenarios.email`
- **Admin Override**: Admins can access any scenario regardless of email match
- **No Complex Joins**: Simple direct comparison instead of LEFT JOINs

### Benefits

1. **Simpler Queries**: No need for complex joins in authorization checks
2. **Faster Lookups**: Direct email comparison with indexed column
3. **Clear Ownership**: Email clearly identifies the owner
4. **Backward Compatible**: client_id and created_by fields are still maintained

## API Endpoints Updated

The following endpoints now use email-based authorization:

- `POST /api/scenarios.php?method=create` - Creates/updates scenarios with email
- `POST /api/scenarios.php?method=upload_media` - Validates ownership via email
- `POST /api/scenario_files.php` (upload) - Checks email ownership
- `DELETE /api/scenario_files.php` (delete) - Validates email ownership
- `GET /api/scenario_files.php` (download_zip) - Verifies email access

## Migration

To apply the database changes:

```bash
php /tmp/cc-agent/60170913/project/backend/apply_email_scenarios_migration.php
```

This migration:
- Adds the `email` column to scenarios table
- Populates existing scenarios with email from their client or admin associations
- Adds an index on the email column for performance
