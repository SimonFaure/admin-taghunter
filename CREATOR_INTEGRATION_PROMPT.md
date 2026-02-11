# Taghunter Creator - Backend Integration Instructions

This document provides clear instructions for integrating Taghunter Creator with the Admin Taghunter backend APIs.

## Overview

Creator communicates with the Admin Taghunter backend through standardized REST APIs. All APIs use email-based authentication and return consistent response formats.

## Base URL

```
https://admin.taghunter.fr/backend/api
```

## Authentication

All Creator endpoints use **email-based authentication**:
- No OAuth or complex token management
- User email is passed with each request
- Backend validates email exists and has proper permissions
- Admins can access all resources; clients can only access their own

## API Endpoints for Creator

### 1. Pattern Upload API

**Purpose:** Upload game patterns (configurations) from Creator to Admin

**Endpoint:** `POST /patterns.php?action=upload`

**Request Format:**
```javascript
{
  email: string,           // User's email (required)
  name: string,            // Pattern name (required)
  game_type: string,       // Game type: 'tag', 'laser', etc. (required)
  pattern_data: object,    // Pattern configuration object (required)
  version: string,         // Version: '1.0', '2.0', etc. (required)
  is_default: boolean      // Only true if user is admin (optional)
}
```

**Example Request:**
```javascript
const response = await fetch(
  'https://admin.taghunter.fr/backend/api/patterns.php?action=upload',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'user@example.com',
      name: 'Classic Tag Pattern',
      game_type: 'tag',
      pattern_data: {
        players: { min: 2, max: 10 },
        duration: 300,
        rules: {
          allowPowerUps: true,
          tagDistance: 2.0
        }
      },
      version: '1.0',
      is_default: false
    })
  }
);

const result = await response.json();
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "name": "Classic Tag Pattern",
    "game_type": "tag",
    "version": "1.0",
    "pattern_data": "{...}",
    "is_default": false,
    "owner_type": "admin",
    "owner_id": 1,
    "created_by_email": "user@example.com",
    "created_at": "2025-01-15 10:30:45"
  }
}
```

**Error Response (400/404/500):**
```json
{
  "error": "Error message description",
  "details": {
    "file": "patterns.php",
    "line": 123
  }
}
```

**Common Errors:**
- `Email is required` (400) - Missing email parameter
- `Pattern data is required` (400) - Missing pattern_data
- `Pattern name is required` (400) - Missing name
- `Game type is required` (400) - Missing game_type
- `User with this email not found` (404) - Email not in database
- `Invalid JSON pattern data` (400) - pattern_data is not valid JSON

---

### 2. Default Configuration API

**Purpose:** Create/update default game configurations (admin only)

**Endpoint:** `POST /default_config.php?action=create`

**Request Format:**
```javascript
{
  user_email: string,      // Admin user's email (required)
  meta: string,            // Configuration identifier (required)
  version: number,         // Version number (required)
  value: object            // Configuration object (required)
}
```

**Example Request:**
```javascript
const response = await fetch(
  'https://admin.taghunter.fr/backend/api/default_config.php?action=create',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': userAuthToken  // Optional if using session
    },
    body: JSON.stringify({
      user_email: 'admin@example.com',
      meta: 'tag_game_default_settings',
      version: 1,
      value: {
        maxPlayers: 10,
        minPlayers: 2,
        defaultDuration: 300,
        allowedPowerUps: ['speed', 'invisibility', 'shield'],
        scoring: {
          tagPoints: 10,
          survivalBonus: 5
        }
      }
    })
  }
);

const result = await response.json();
```

**Success Response - Create (201):**
```json
{
  "success": true,
  "meta": "tag_game_default_settings",
  "version": 1,
  "action": "created"
}
```

**Success Response - Update (200):**
```json
{
  "success": true,
  "meta": "tag_game_default_settings",
  "version": 2,
  "action": "updated"
}
```

**Error Response (400/403/500):**
```json
{
  "error": "Error message description",
  "details": {
    "file": "default_config.php",
    "line": 156
  }
}
```

**Common Errors:**
- `Missing required fields: user_email, meta, version, value` (400) - Missing parameters
- `Value must be a JSON object or array` (400) - value is not an object/array
- `User is not an admin` (403) - user_email is not an admin user
- `Unauthorized` (401) - Missing or invalid auth token

**Important Notes:**
1. **Admin Only:** Only admin users can create/update default configurations
2. **Auto-Versioning:** If a config with the same `meta` exists, it will be updated and version incremented automatically
3. **Value Type:** The `value` field MUST be a JSON object or array, not a string or primitive

---

## Complete Integration Example

Here's a complete JavaScript class for Creator integration:

```javascript
class TaghunterAPI {
  constructor(baseUrl = 'https://admin.taghunter.fr/backend/api') {
    this.baseUrl = baseUrl;
    this.userEmail = null;
    this.authToken = null;
  }

  /**
   * Initialize API with user email
   */
  setUser(email, authToken = null) {
    this.userEmail = email;
    this.authToken = authToken;
  }

  /**
   * Upload a pattern to Admin Taghunter
   */
  async uploadPattern(patternData) {
    if (!this.userEmail) {
      throw new Error('User email not set. Call setUser() first.');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/patterns.php?action=upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: this.userEmail,
            name: patternData.name,
            game_type: patternData.gameType,
            pattern_data: patternData.data,
            version: patternData.version || '1.0',
            is_default: patternData.isDefault || false
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        const error = new Error(result.error || 'Pattern upload failed');
        error.details = result.details;
        throw error;
      }

      return result.data;
    } catch (error) {
      console.error('Pattern upload failed:', error);
      throw error;
    }
  }

  /**
   * Create or update default configuration (admin only)
   */
  async createDefaultConfig(meta, configValue, version = 1) {
    if (!this.userEmail) {
      throw new Error('User email not set. Call setUser() first.');
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (this.authToken) {
        headers['X-Auth-Token'] = this.authToken;
      }

      const response = await fetch(
        `${this.baseUrl}/default_config.php?action=create`,
        {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            user_email: this.userEmail,
            meta: meta,
            version: version,
            value: configValue
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        const error = new Error(result.error || 'Config creation failed');
        error.details = result.details;
        throw error;
      }

      return result;
    } catch (error) {
      console.error('Config creation failed:', error);
      throw error;
    }
  }

  /**
   * Test API connectivity
   */
  async healthCheck(endpoint = 'patterns') {
    try {
      const response = await fetch(
        `${this.baseUrl}/${endpoint}.php?action=health`
      );
      const result = await response.json();
      return result.status === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Export for use in Creator
export default TaghunterAPI;
```

## Usage in Creator

### Pattern Upload Flow

```javascript
// 1. Initialize API
const api = new TaghunterAPI();
api.setUser('user@example.com');

// 2. Prepare pattern data
const myPattern = {
  name: 'Urban Tag Game',
  gameType: 'tag',
  version: '1.0',
  data: {
    players: { min: 4, max: 20 },
    duration: 600,
    arena: {
      type: 'outdoor',
      radius: 100
    },
    rules: {
      tagDistance: 2.0,
      respawnTime: 10,
      powerUps: true
    }
  }
};

// 3. Upload pattern
try {
  const uploaded = await api.uploadPattern(myPattern);
  console.log('Pattern uploaded successfully:', uploaded);

  // Show success message to user
  showNotification('Pattern uploaded!', 'success');
} catch (error) {
  console.error('Upload failed:', error.message);

  // Show error to user
  showNotification(`Upload failed: ${error.message}`, 'error');
}
```

### Default Config Creation Flow (Admin Only)

```javascript
// 1. Initialize API with auth token
const api = new TaghunterAPI();
api.setUser('admin@example.com', userAuthToken);

// 2. Prepare configuration
const defaultConfig = {
  maxPlayers: 10,
  minPlayers: 2,
  defaultDuration: 300,
  gameSettings: {
    tagDistance: 2.0,
    allowPowerUps: true,
    respawnEnabled: true
  }
};

// 3. Create/update configuration
try {
  const result = await api.createDefaultConfig(
    'tag_game_defaults',
    defaultConfig,
    1
  );

  console.log(`Config ${result.action}:`, result);

  // Show success message
  showNotification(`Config ${result.action} (v${result.version})`, 'success');
} catch (error) {
  if (error.message.includes('not an admin')) {
    showNotification('Only admins can create default configurations', 'error');
  } else {
    showNotification(`Config creation failed: ${error.message}`, 'error');
  }
}
```

## Error Handling Best Practices

### 1. Always Check Response

```javascript
const response = await fetch(url, options);
const result = await response.json();

// Check both HTTP status and success flag
if (!response.ok || !result.success) {
  throw new Error(result.error || 'Operation failed');
}
```

### 2. Display User-Friendly Errors

```javascript
function getUserFriendlyError(error) {
  const errorMap = {
    'User with this email not found': 'Your account was not found. Please contact support.',
    'Email is required': 'Email address is missing.',
    'Pattern data is required': 'Pattern configuration is missing.',
    'User is not an admin': 'You need admin privileges for this action.',
    'Invalid JSON pattern data': 'Pattern data is invalid. Please check your configuration.'
  };

  return errorMap[error] || error;
}

try {
  await api.uploadPattern(pattern);
} catch (error) {
  const friendlyMessage = getUserFriendlyError(error.message);
  showNotification(friendlyMessage, 'error');
}
```

### 3. Log Detailed Errors for Debugging

```javascript
try {
  const result = await api.uploadPattern(pattern);
} catch (error) {
  // Log full error for debugging
  console.error('Pattern upload failed:', {
    message: error.message,
    details: error.details,
    stack: error.stack,
    pattern: pattern
  });

  // Show simple message to user
  showNotification('Upload failed. Please try again.', 'error');
}
```

## Testing & Debugging

### Health Check

Before making API calls, verify connectivity:

```javascript
const api = new TaghunterAPI();

// Test patterns API
const patternsOk = await api.healthCheck('patterns');
console.log('Patterns API:', patternsOk ? 'OK' : 'DOWN');

// Test default_config API
const configOk = await api.healthCheck('default_config');
console.log('Config API:', configOk ? 'OK' : 'DOWN');
```

### Network Inspection

Use browser DevTools to inspect API calls:

1. Open DevTools (F12)
2. Go to Network tab
3. Make API call from Creator
4. Click on the request to see:
   - Request headers
   - Request payload
   - Response status
   - Response body
   - Timing information

### Common Issues

**Issue:** "User with this email not found"
- **Solution:** Verify email exists in Admin Taghunter (check spelling)

**Issue:** "User is not an admin"
- **Solution:** Default config creation is admin-only, check user permissions

**Issue:** 500 Internal Server Error
- **Solution:** Check server logs or contact backend team with request details

**Issue:** CORS error
- **Solution:** Backend CORS is configured, may be browser cache - clear and retry

## API Response Times

Expected response times:
- Pattern upload: 100-500ms
- Default config create: 50-200ms
- Health check: < 50ms

If responses are slower:
- Check network connection
- Verify pattern_data size (large objects take longer)
- Check if server is under load

## Security Notes

1. **Never expose admin credentials in Creator**
2. **Always use HTTPS** (enforced by backend)
3. **Validate user input** before sending to API
4. **Don't log sensitive data** in production
5. **Handle errors gracefully** without exposing internal details

## Support & Documentation

- Full API documentation: `CREATOR_API_INTEGRATION.md`
- Debugging guide: `PATTERN_UPLOAD_DEBUG.md`
- For issues: Check server error logs or contact backend team

## Quick Reference

| Action | Endpoint | Method | Auth |
|--------|----------|--------|------|
| Upload Pattern | `/patterns.php?action=upload` | POST | Email |
| Create/Update Config | `/default_config.php?action=create` | POST | Email + Token |
| Health Check | `/patterns.php?action=health` | GET | None |
| Health Check | `/default_config.php?action=health` | GET | None |

## Version History

- **v1.0** (2025-01-15): Initial integration with pattern upload and default config creation
- Enhanced error logging and debugging capabilities
- Added health check endpoints
