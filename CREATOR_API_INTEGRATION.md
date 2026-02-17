# Taghunter Creator API Integration Guide

This document describes the standardized API endpoints used by Taghunter Creator to communicate with the Admin Taghunter backend.

## Overview

All Creator endpoints follow a consistent pattern for authentication, parameter naming, and response format. This ensures a predictable and secure integration.

## Authentication

All Creator endpoints use **email-based authentication**. The user's email is sent with each request to verify ownership and permissions.

### How it works:
1. User logs into Creator with their email
2. Creator validates the email exists using the `check_email` endpoint
3. All subsequent requests include the `email` parameter
4. Backend verifies the email matches the resource owner (scenario, pattern, file)

### Authorization Levels:
- **Clients**: Can only access their own resources
- **Admins**: Can access all resources (scenarios, patterns, files)

---

## Standard Patterns

### Parameter Naming
All endpoints use **`email`** (not `userEmail` or other variations) for user identification.

### Response Format
All successful responses follow this structure:
```json
{
  "success": true,
  "data": { /* resource data */ },
  "message": "Operation description"
}
```

Error responses:
```json
{
  "error": "Error message description"
}
```

---

## API Endpoints

### 1. Check if User Exists

**Endpoint:** `GET /backend/api/check_email.php?email={email}`

**Purpose:** Verify if a user exists and determine if they're an admin or client

**Authentication:** None (public endpoint)

**Request:**
```
GET /backend/api/check_email.php?email=user@example.com
```

**Response:**
```json
{
  "data": {
    "exists": true,
    "is_admin": false,
    "client_id": 123
  }
}
```

**Fields:**
- `exists` (boolean): Whether the email exists in the system
- `is_admin` (boolean): Whether the user is an admin
- `client_id` (integer, optional): Client ID if user is a client
- `admin_id` (integer, optional): Admin ID if user is an admin

**Usage in Creator:**
```javascript
async function checkUserExists(email) {
  const response = await fetch(
    `https://admin.taghunter.fr/backend/api/check_email.php?email=${encodeURIComponent(email)}`
  );
  const result = await response.json();

  if (!result.data.exists) {
    throw new Error('User not found');
  }

  return result.data;
}
```

---

### 2. Send Scenario to Admin

**Endpoint:** `POST /backend/api/scenarios.php?action=create`

**Purpose:** Create or update a scenario from Creator

**Authentication:** Email-based (via `email` parameter)

**Request:**
```javascript
const formData = new FormData();
formData.append('email', userEmail);
formData.append('scenarioData', JSON.stringify({
  title: 'My Scenario',
  description: 'Scenario description',
  uniqid: 'unique-scenario-id',
  game_type: 'tag',
  scenario_type: 'multiplayer',
  scenario_layout: [],
  data: {},
  media: {}
}));

const response = await fetch(
  'https://admin.taghunter.fr/backend/api/scenarios.php?action=create',
  {
    method: 'POST',
    body: formData
  }
);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "client_id": 123,
    "title": "My Scenario",
    "description": "Scenario description",
    "uniqid": "unique-scenario-id",
    "game_type": "tag",
    "scenario_type": "multiplayer",
    "data": "{}",
    "medias": "{}",
    "game_meta": "{}",
    "scenario_layout": "[]",
    "created_at": "2024-01-01 12:00:00"
  },
  "message": "Scenario created successfully"
}
```

**Important Notes:**
- If a scenario with the same `uniqid` exists, it will be **updated** instead of creating a duplicate
- The `email` must match a client or admin in the database
- All JSON fields (`data`, `media`, `scenario_layout`) are automatically converted to JSON strings

**Required Fields:**
- `email`: User's email address
- `title`: Scenario title
- `description`: Scenario description
- `uniqid`: Unique identifier for the scenario
- `game_type`: Type of game
- `scenario_type`: Type of scenario

---

### 3. Upload Scenario Files

**Endpoint:** `POST /backend/api/scenario_files.php?action=upload`

**Purpose:** Upload individual files (images, videos, audio) for a scenario

**Authentication:** Email-based (via `email` parameter)

**Request:**
```javascript
const formData = new FormData();
formData.append('email', userEmail);
formData.append('scenario_id', scenarioId);
formData.append('name', 'Background Image');
formData.append('file', fileBlob, 'background.jpg');

const response = await fetch(
  'https://admin.taghunter.fr/backend/api/scenario_files.php?action=upload',
  {
    method: 'POST',
    body: formData
  }
);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 789,
    "scenario_id": 456,
    "name": "Background Image",
    "file_path": "abc123/files/background_1234567890.jpg",
    "file_size": 524288,
    "mime_type": "image/jpeg",
    "created_at": "2024-01-01 12:05:00"
  },
  "message": "File uploaded successfully"
}
```

**Required Fields:**
- `email`: User's email address
- `scenario_id`: ID of the scenario (from scenario creation response)
- `name`: Descriptive name for the file
- `file`: The file to upload (multipart/form-data)

**File Storage:**
Files are stored in: `/media/{scenario_uniqid}/files/{sanitized_filename}`

**Security:**
- Maximum file size: 50MB
- User must own the scenario (client owner, admin creator, or any admin)
- File names are sanitized to prevent directory traversal

---

### 4. Upload Media for Scenario

**Endpoint:** `POST /backend/api/scenarios.php?action=upload_media`

**Purpose:** Upload individual media files and get their URL

**Authentication:** Email-based (via `email` parameter)

**Request:**
```javascript
const formData = new FormData();
formData.append('email', userEmail);
formData.append('uniqid', scenarioUniqid);
formData.append('file', fileBlob, 'icon.png');

const response = await fetch(
  'https://admin.taghunter.fr/backend/api/scenarios.php?action=upload_media',
  {
    method: 'POST',
    body: formData
  }
);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "icon.png",
    "path": "/media/unique-scenario-id/icon.png",
    "url": "https://admin.taghunter.fr/media/unique-scenario-id/icon.png"
  },
  "message": "File uploaded successfully"
}
```

**Required Fields:**
- `email`: User's email address
- `uniqid`: Unique identifier of the scenario
- `file`: The file to upload (multipart/form-data)

**File Storage:**
Files are stored in: `/media/{scenario_uniqid}/{original_filename}`

**Use Case:**
This endpoint is used to upload individual media files and get their public URL. The URLs can then be included in the scenario's `media` object.

---

### 5. Upload Pattern

**Endpoint:** `POST /backend/api/patterns.php?action=upload`

**Purpose:** Upload a game pattern from Creator

**Authentication:** Email-based (via `email` parameter)

**Request:**
```javascript
const response = await fetch(
  'https://admin.taghunter.fr/backend/api/patterns.php?action=upload',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: userEmail,
      name: 'Classic Tag Pattern',
      pattern_data: {
        /* pattern configuration */
      },
      game_type: 'tag',
      version: '1.0',
      is_default: false
    })
  }
);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 321,
    "name": "Classic Tag Pattern",
    "game_type": "tag",
    "version": "1.0",
    "pattern_data": "{...}",
    "is_default": false,
    "owner_type": "client",
    "owner_id": 123,
    "created_by_email": "user@example.com",
    "created_at": "2024-01-01 12:10:00"
  }
}
```

**Required Fields:**
- `email`: User's email address
- `name`: Pattern name
- `pattern_data`: Pattern configuration (object or JSON string)
- `game_type`: Type of game (e.g., 'tag', 'laser', 'treasure_hunt')
- `version`: Pattern version (e.g., '1.0')

**Optional Fields:**
- `is_default` (boolean): Whether this is a default pattern (admin only)

**Security:**
- Only admins can set `is_default: true`
- Pattern ownership is automatically determined by email (client or admin)

---

### 6. List All Clients (Admin Only)

**Endpoint:** `GET /backend/api/clients.php?action=creator_list&email={email}`

**Purpose:** Get a list of all clients (admin only)

**Authentication:** Email-based (via `email` parameter)

**Request:**
```javascript
const email = 'admin@taghunter.fr';
const response = await fetch(
  `https://admin.taghunter.fr/backend/api/clients.php?action=creator_list&email=${encodeURIComponent(email)}`
);
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "client@example.com",
      "name": "Client Name",
      "company": "Company Name",
      "phone": "+33 1 23 45 67 89",
      "notes": "Client notes",
      "avatar_url": "https://admin.taghunter.fr/media/avatars/client_1.jpg",
      "license_type": "premium",
      "billing_up_to_date": true,
      "playground_version": "1.0.0",
      "creator_version": "1.0.0",
      "created_at": "2024-01-01 12:00:00",
      "updated_at": "2024-01-01 12:00:00"
    }
  ],
  "message": "Clients retrieved successfully"
}
```

**Required Fields:**
- `email`: Admin user's email address

**Security:**
- Only admin users can access this endpoint
- Client users will receive a 403 Forbidden error

**Use Cases:**
- Display list of clients in Creator app for admins
- Allow admins to select a client when creating scenarios
- Show client information and statistics

---

### 7. Create/Update Default Configuration

**Endpoint:** `POST /backend/api/default_config.php?action=create`

**Purpose:** Create or update default game configuration (admin only)

**Authentication:** Session-based OR Token-based

**Request:**
```javascript
const response = await fetch(
  'https://admin.taghunter.fr/backend/api/default_config.php?action=create',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': userToken  // Optional if using session
    },
    body: JSON.stringify({
      user_email: userEmail,
      meta: 'tag_game_config',
      version: 1,
      value: {
        maxPlayers: 10,
        minPlayers: 2,
        roundDuration: 300,
        settings: {
          /* configuration object */
        }
      }
    })
  }
);
```

**Response (Create):**
```json
{
  "success": true,
  "meta": "tag_game_config",
  "version": 1,
  "action": "created"
}
```

**Response (Update):**
```json
{
  "success": true,
  "meta": "tag_game_config",
  "version": 2,
  "action": "updated"
}
```

**Required Fields:**
- `user_email`: Admin user's email address
- `meta`: Configuration identifier (unique key)
- `version`: Version number (integer)
- `value`: Configuration object (must be JSON object or array)

**Important Notes:**
- **Admin only**: The `user_email` must belong to an admin user
- **Auto-versioning**: If a config with the same `meta` exists, it will be updated and version auto-incremented
- **Value format**: The `value` field must be a JSON object or array (not a string or primitive)

**Security:**
- Only admin users can create/update default configurations
- Client users will receive a 403 Forbidden error

**Use Cases:**
- Store default game configurations for different game types
- Define global settings that can be used by multiple scenarios
- Version control for configuration changes

---

## Complete Integration Example

Here's a complete flow for creating a scenario with files from Creator:

```javascript
class TaghunterCreatorAPI {
  constructor(baseUrl = 'https://admin.taghunter.fr/backend/api') {
    this.baseUrl = baseUrl;
    this.userEmail = null;
  }

  // Step 1: Check if user exists
  async checkUser(email) {
    const response = await fetch(
      `${this.baseUrl}/check_email.php?email=${encodeURIComponent(email)}`
    );
    const result = await response.json();

    if (!result.data.exists) {
      throw new Error('User not found. Please register first.');
    }

    this.userEmail = email;
    return result.data;
  }

  // Step 2: Create scenario
  async createScenario(scenarioData) {
    const formData = new FormData();
    formData.append('email', this.userEmail);
    formData.append('scenarioData', JSON.stringify({
      title: scenarioData.title,
      description: scenarioData.description,
      uniqid: scenarioData.uniqid,
      game_type: scenarioData.game_type,
      scenario_type: scenarioData.scenario_type,
      scenario_layout: scenarioData.scenario_layout || [],
      data: scenarioData.data || {},
      media: scenarioData.media || {}
    }));

    const response = await fetch(
      `${this.baseUrl}/scenarios.php?action=create`,
      {
        method: 'POST',
        body: formData
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to create scenario');
    }

    return result.data;
  }

  // Step 3: Upload files
  async uploadScenarioFile(scenarioId, fileName, fileBlob, displayName) {
    const formData = new FormData();
    formData.append('email', this.userEmail);
    formData.append('scenario_id', scenarioId);
    formData.append('name', displayName);
    formData.append('file', fileBlob, fileName);

    const response = await fetch(
      `${this.baseUrl}/scenario_files.php?action=upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload file');
    }

    return result.data;
  }

  // Step 4: Upload media and get URL
  async uploadMedia(scenarioUniqid, fileBlob, fileName) {
    const formData = new FormData();
    formData.append('email', this.userEmail);
    formData.append('uniqid', scenarioUniqid);
    formData.append('file', fileBlob, fileName);

    const response = await fetch(
      `${this.baseUrl}/scenarios.php?action=upload_media`,
      {
        method: 'POST',
        body: formData
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload media');
    }

    return result.data;
  }

  // Step 5: Upload pattern
  async uploadPattern(patternData) {
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
          pattern_data: patternData.pattern_data,
          game_type: patternData.game_type,
          version: patternData.version || '1.0',
          is_default: patternData.is_default || false
        })
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload pattern');
    }

    return result.data;
  }

  // Step 6: List all clients (admin only)
  async listClients() {
    const response = await fetch(
      `${this.baseUrl}/clients.php?action=creator_list&email=${encodeURIComponent(this.userEmail)}`
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to list clients');
    }

    return result.data;
  }

  // Step 7: Create/Update default configuration (admin only)
  async createDefaultConfig(meta, configValue, version = 1) {
    const response = await fetch(
      `${this.baseUrl}/default_config.php?action=create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          meta: meta,
          version: version,
          value: configValue
        })
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to create/update config');
    }

    return result;
  }
}

// Usage Example
async function publishScenario() {
  const api = new TaghunterCreatorAPI();

  try {
    // 1. Verify user
    const user = await api.checkUser('user@example.com');
    console.log('User verified:', user);

    // 2. Create scenario
    const scenario = await api.createScenario({
      title: 'My Awesome Game',
      description: 'A fun tag game',
      uniqid: 'game-' + Date.now(),
      game_type: 'tag',
      scenario_type: 'multiplayer',
      scenario_layout: [],
      data: { maxPlayers: 10 },
      media: {}
    });
    console.log('Scenario created:', scenario);

    // 3. Upload background image
    const bgBlob = await fetch('/assets/background.jpg').then(r => r.blob());
    const bgFile = await api.uploadScenarioFile(
      scenario.id,
      'background.jpg',
      bgBlob,
      'Background Image'
    );
    console.log('Background uploaded:', bgFile);

    // 4. Upload icon and get URL
    const iconBlob = await fetch('/assets/icon.png').then(r => r.blob());
    const iconMedia = await api.uploadMedia(
      scenario.uniqid,
      iconBlob,
      'icon.png'
    );
    console.log('Icon uploaded:', iconMedia.url);

    // 5. Upload pattern
    const pattern = await api.uploadPattern({
      name: 'Classic Tag',
      pattern_data: { /* pattern config */ },
      game_type: 'tag',
      version: '1.0'
    });
    console.log('Pattern uploaded:', pattern);

    // 6. List all clients (admin only)
    const clients = await api.listClients();
    console.log('Available clients:', clients);

    // 7. Create default config (admin only)
    const config = await api.createDefaultConfig(
      'tag_game_settings',
      {
        maxPlayers: 10,
        roundDuration: 300,
        powerUps: ['speed', 'invisibility']
      },
      1
    );
    console.log('Default config created:', config);

    console.log('Scenario published successfully!');
  } catch (error) {
    console.error('Error publishing scenario:', error);
  }
}
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200**: Success
- **201**: Created (new resource)
- **400**: Bad Request (missing parameters, invalid data)
- **401**: Unauthorized (missing authentication)
- **403**: Forbidden (user doesn't own the resource)
- **404**: Not Found (resource doesn't exist)
- **405**: Method Not Allowed (wrong HTTP method)
- **500**: Server Error

Always check the `success` field in the response:

```javascript
const response = await fetch(endpoint);
const result = await response.json();

if (!result.success) {
  throw new Error(result.error || 'Operation failed');
}

// Use result.data
```

---

## Security Best Practices

1. **Always include the email parameter** in Creator requests
2. **Validate file sizes** before upload (50MB max)
3. **Use HTTPS** for all API calls (enforced by backend)
4. **Handle errors gracefully** and show user-friendly messages
5. **Never expose admin credentials** in Creator
6. **Sanitize user input** before sending to API

---

## Updates from Previous Version

### Breaking Changes:
1. **Parameter renamed:** `userEmail` → `email` (all endpoints)
2. **Response format:** `scenario` → `data`, `file` → `data` (standardized)
3. **Security added:** `scenario_files.php` now requires `email` parameter
4. **Response messages:** All success responses now include a `message` field

### Migration Guide:
```javascript
// OLD (deprecated)
formData.append('userEmail', email);

// NEW (current)
formData.append('email', email);

// OLD response access
const scenario = result.scenario;

// NEW response access
const scenario = result.data;
```

---

## Support

For issues or questions about the API integration, contact the Taghunter admin team or refer to the backend logs at `/backend/utils/Logger.php`.
