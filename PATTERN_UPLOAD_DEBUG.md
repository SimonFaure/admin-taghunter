# Pattern Upload Error 500 - Debugging Guide

This document explains the enhancements made to help diagnose the 500 error when calling `/backend/api/patterns.php?action=upload` from Creator.

## Changes Made

### 1. Enhanced Error Logging

Added comprehensive error logging throughout the patterns upload endpoint:

- **File initialization tracking**: Logs when each required file is loaded
- **Fatal error capture**: Registers a shutdown function to catch PHP fatal errors
- **Step-by-step upload tracking**: Logs every step of the upload process
- **Exception handling**: Wraps the entire upload case in a try-catch block

### 2. Error Visibility

Enabled PHP error reporting in `patterns.php`:
```php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
ini_set('log_errors', '1');
```

### 3. Health Check Endpoint

Added a new `/backend/api/patterns.php?action=health` endpoint to verify the API is accessible:
```bash
curl https://your-domain.com/backend/api/patterns.php?action=health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15 10:30:45",
  "action": "health"
}
```

### 4. Diagnostic Test Script

Created `/backend/api/test_patterns_upload.php` - a browser-accessible diagnostic tool.

Access it at: `https://your-domain.com/backend/api/test_patterns_upload.php`

This script checks:
- Database connection
- Patterns table existence and structure
- Admin users and clients tables
- File permissions
- PHP error configuration

## How to Debug

### Step 1: Check Health Endpoint

```bash
curl -X GET https://your-domain.com/backend/api/patterns.php?action=health
```

If this fails with 500:
- The issue is in the PHP initialization (requires, database connection)
- Check web server error logs (see Step 4)

If this succeeds:
- The API is accessible, issue is specific to the upload action
- Continue to Step 2

### Step 2: Run Diagnostic Test

Open in browser: `https://your-domain.com/backend/api/test_patterns_upload.php`

This will show:
- ✓ or ✗ for each system check
- Database table structure
- File permissions
- PHP configuration

### Step 3: Check Application Logs

In the Admin Taghunter dashboard:
1. Go to **Logs** view
2. Filter by:
   - Endpoint: `patterns`
   - Action: `upload`
   - Source: `creator`
3. Look for error messages in the logs

The enhanced logging now captures:
- `patterns.php: Starting script execution`
- `patterns.php: Database instance created`
- `patterns.php: Action = upload`
- `=== Pattern Upload Started ===`
- Each validation step
- Database operations
- Success or failure messages

### Step 4: Check Server Error Logs

The error might be logged in your web server's error log:

**Apache:**
```bash
tail -f /var/log/apache2/error.log
# or
tail -f /var/log/httpd/error_log
```

**Nginx:**
```bash
tail -f /var/log/nginx/error.log
```

**PHP-FPM:**
```bash
tail -f /var/log/php-fpm/error.log
# or
tail -f /var/log/php8.x-fpm.log
```

Look for:
- Fatal errors
- Parse errors
- Memory exhaustion
- Database connection errors

### Step 5: Test Upload with cURL

Test the upload endpoint directly:

```bash
curl -X POST https://your-domain.com/backend/api/patterns.php?action=upload \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-admin-email@example.com",
    "name": "Test Pattern",
    "game_type": "test",
    "pattern_data": {"test": "data"},
    "is_default": false,
    "version": "1.0"
  }'
```

This will show:
- The exact error message
- File and line number where the error occurred

## Common Issues and Solutions

### Issue 1: "User with this email not found"

**Cause**: The email provided doesn't exist in `admin_users` or `clients` tables.

**Solution**:
- Verify the email exists in the database
- Check the email is correctly passed from Creator

### Issue 2: Database Connection Failed

**Cause**: Database credentials incorrect or database server unavailable.

**Solution**:
- Check `/backend/config/database.php`
- Verify database server is running
- Test connection with: `mysql -h host -u user -p database`

### Issue 3: "patterns table does not exist"

**Cause**: Migration hasn't been run.

**Solution**:
- Run the patterns migration: `/backend/apply_patterns_migration.php`
- Or check `/backend/database/patterns_migration.sql`

### Issue 4: PHP Memory Limit

**Cause**: Pattern data is too large.

**Solution**:
- Increase PHP memory limit in `php.ini`:
  ```
  memory_limit = 256M
  ```
- Or check pattern data size in Creator before upload

### Issue 5: JSON Parsing Error

**Cause**: Invalid JSON in pattern_data.

**Solution**:
- The enhanced error logging now shows:
  - `Invalid JSON pattern data: [error message]`
  - Which field has invalid JSON
- Validate JSON in Creator before sending

## Error Log Examples

### Successful Upload
```
patterns.php: Starting script execution
patterns.php: Database instance created
patterns.php: Action = upload
=== Pattern Upload Started ===
Request method: POST
Content-Type: application/json
Data retrieved, keys: ["email","name","game_type","pattern_data","version"]
Pattern upload request received: {...}
Looking up user by email: admin@example.com
User found: admin, ID: 1
Converting pattern data to JSON
About to insert pattern: {...}
Pattern inserted successfully, ID: 42
=== Pattern Upload Successful ===
```

### Failed Upload (User Not Found)
```
patterns.php: Starting script execution
patterns.php: Database instance created
patterns.php: Action = upload
=== Pattern Upload Started ===
Looking up user by email: unknown@example.com
Not an admin, checking clients table
Upload failed: User not found for email: unknown@example.com
```

### Fatal Error Example
```
FATAL ERROR in patterns.php: {
  "type": 1,
  "message": "Call to undefined function xyz()",
  "file": "/path/to/patterns.php",
  "line": 123
}
```

## Next Steps

1. **Try the health check endpoint first**
2. **Run the diagnostic test script**
3. **Check the server error logs** while making a request from Creator
4. **Look for the detailed logs** in the error output or application logs
5. **Share the specific error message** for further assistance

## Enhanced Error Response

The API now returns detailed error information in the response:

```json
{
  "error": "Pattern upload failed: [specific error]",
  "details": {
    "file": "patterns.php",
    "line": 123
  }
}
```

This helps pinpoint exactly where the error occurred.

## Testing from Creator

When testing from Creator, ensure:
1. The request includes `Content-Type: application/json` header
2. All required fields are present:
   - `email` (admin or client email)
   - `name` (pattern name)
   - `game_type` (game type)
   - `pattern_data` (the pattern object)
3. Check Creator's network tab for the exact error response

## Support

If the issue persists after following these steps, provide:
1. The health check response
2. The diagnostic test output
3. Server error log entries
4. The exact error response from the upload attempt
5. Which version of PHP is running (`php -v`)
