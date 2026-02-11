# Creator API Error 500 - Debugging Guide

This document explains the enhancements made to help diagnose 500 errors when calling Creator endpoints from the Taghunter Creator application.

## Affected Endpoints

This guide covers debugging for:
- `/backend/api/patterns.php?action=upload` - Pattern uploads
- `/backend/api/default_config.php?action=create` - Default configuration creation

## Changes Made

### 1. Enhanced Error Logging

Added comprehensive error logging throughout both endpoints:

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

### 3. Health Check Endpoints

Added health check endpoints to verify APIs are accessible:

**Patterns API:**
```bash
curl https://your-domain.com/backend/api/patterns.php?action=health
```

**Default Config API:**
```bash
curl https://your-domain.com/backend/api/default_config.php?action=health
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

### Step 1: Check Health Endpoints

**Test Patterns API:**
```bash
curl -X GET https://your-domain.com/backend/api/patterns.php?action=health
```

**Test Default Config API:**
```bash
curl -X GET https://your-domain.com/backend/api/default_config.php?action=health
```

If either fails with 500:
- The issue is in the PHP initialization (requires, database connection)
- Check web server error logs (see Step 4)

If both succeed:
- The APIs are accessible, issue is specific to the create/upload actions
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

### Step 5: Test Endpoints with cURL

**Test Pattern Upload:**
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

**Test Default Config Creation:**
```bash
curl -X POST https://your-domain.com/backend/api/default_config.php?action=create \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -d '{
    "user_email": "your-admin-email@example.com",
    "meta": "test_config",
    "version": 1,
    "value": {"test": "config"}
  }'
```

These will show:
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

### Successful Pattern Upload
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

### Successful Default Config Creation
```
default_config.php: Starting script execution
default_config.php: Database instance created
default_config.php: Action = create
=== Default Config Create Started ===
Request method: POST
Content-Type: application/json
Data retrieved, keys: ["user_email","meta","version","value"]
Auth check passed, user_id: 5, type: admin
Looking up user by email: admin@example.com
User found: admin, ID: 1
Checking existing config for meta: tag_game_config, found: no
Creating new config
Config created successfully
=== Default Config Create Successful ===
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

### Failed Config Creation (Not Admin)
```
default_config.php: Starting script execution
default_config.php: Database instance created
default_config.php: Action = create
=== Default Config Create Started ===
Looking up user by email: client@example.com
Create failed: User not admin for email: client@example.com
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

### Pattern Upload Requirements:
1. The request includes `Content-Type: application/json` header
2. All required fields are present:
   - `email` (admin or client email)
   - `name` (pattern name)
   - `game_type` (game type)
   - `pattern_data` (the pattern object)
   - `version` (pattern version, e.g., "1.0")
3. Check Creator's network tab for the exact error response

### Default Config Creation Requirements:
1. The request includes `Content-Type: application/json` header
2. Authentication token in `X-Auth-Token` header (if not using session)
3. All required fields are present:
   - `user_email` (admin email only)
   - `meta` (config identifier)
   - `version` (version number)
   - `value` (configuration object)
4. User must be an admin (clients will get 403 error)
5. The `value` field must be a JSON object or array, not a string

### Creator Integration Code Example:

```javascript
// Pattern Upload
async function uploadPattern(email, patternData) {
  try {
    const response = await fetch(
      'https://admin.taghunter.fr/backend/api/patterns.php?action=upload',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          name: patternData.name,
          game_type: patternData.gameType,
          pattern_data: patternData.data,
          version: patternData.version || '1.0',
          is_default: false
        })
      }
    );

    const result = await response.json();

    if (!result.success) {
      console.error('Upload failed:', result.error);
      if (result.details) {
        console.error('Error details:', result.details);
      }
      throw new Error(result.error);
    }

    console.log('Pattern uploaded successfully:', result.data);
    return result.data;
  } catch (error) {
    console.error('Pattern upload exception:', error);
    throw error;
  }
}

// Default Config Creation
async function createDefaultConfig(email, authToken, meta, configValue) {
  try {
    const response = await fetch(
      'https://admin.taghunter.fr/backend/api/default_config.php?action=create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': authToken
        },
        body: JSON.stringify({
          user_email: email,
          meta: meta,
          version: 1,
          value: configValue
        })
      }
    );

    const result = await response.json();

    if (!result.success) {
      console.error('Config creation failed:', result.error);
      if (result.details) {
        console.error('Error details:', result.details);
      }
      throw new Error(result.error);
    }

    console.log('Config created successfully:', result);
    return result;
  } catch (error) {
    console.error('Config creation exception:', error);
    throw error;
  }
}
```

## Support

If the issue persists after following these steps, provide:
1. The health check response
2. The diagnostic test output
3. Server error log entries
4. The exact error response from the upload attempt
5. Which version of PHP is running (`php -v`)
