# Remember Me Feature - Setup Instructions

## Issue

The "Remember Me" feature has been added to the client login, but requires a database migration to work properly.

## Error You're Seeing

```
[Auth] Auto-login failed: Unexpected token '<', "<html><hea"... is not valid JSON
```

This error occurs because the database is missing the `long_lived` column in the `auth_tokens` table.

## Solution

You need to apply the database migration to add the `long_lived` column. Here are two ways to do it:

### Option 1: Using the Fix Endpoint (Easiest)

1. Start your development server if it's not already running
2. Open your browser and navigate to:
   ```
   http://localhost:5173/backend/api/fix_auth_tokens.php
   ```
3. You should see a JSON response indicating the column was added

### Option 2: Using the Migration System

1. Log in to the admin panel
2. Navigate to the Migrations section
3. Click "Run Migrations"
4. The system will apply all pending migrations, including the `add_long_lived_tokens_migration.sql`

### Option 3: Manual Database Update

If you have direct database access, run this SQL:

```sql
ALTER TABLE auth_tokens
ADD COLUMN IF NOT EXISTS long_lived BOOLEAN DEFAULT FALSE AFTER revoked;
```

## Verify the Fix

After applying the migration, you can verify it worked by visiting:
```
http://localhost:5173/backend/api/health_check.php
```

Look for `"long_lived_column": "ok"` in the response.

## What Changed

The "Remember Me" feature allows clients to stay logged in for 30 days instead of 24 hours when they check the box during login. This requires:

1. A new `long_lived` column in the `auth_tokens` table (BOOLEAN)
2. Backend logic to create 30-day tokens when remember_me is true
3. A checkbox in the login form for clients to opt-in

All the code has been updated, only the database migration needs to be applied.
