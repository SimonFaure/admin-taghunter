# Pattern API Documentation for Playground

## Overview
The Pattern API allows you to create, retrieve, update, and delete game patterns. All authenticated endpoints require a valid authentication token.

## Base URL
```
https://admin.taghunter.fr/backend/api/patterns.php
```

## Authentication
All endpoints (except `upload`) require authentication using the `X-Auth-Token` header.

**Header:**
```
X-Auth-Token: your-auth-token-here
```

---

## Endpoints

### 1. Create Pattern
Creates a new pattern for the authenticated user.

**Endpoint:** `POST /patterns.php?action=create`

**Headers:**
```
Content-Type: application/json
X-Auth-Token: your-auth-token-here
```

**Required Parameters:**
- `name` (string) - The name of the pattern
- `version` (string) - Version identifier (e.g., "1.0", "2.1")
- `game_type` (string) - The type of game (e.g., "treasure_hunt", "quiz")
- `pattern_data` (object or string) - JSON data containing the pattern configuration

**Optional Parameters:**
- `description` (string) - Description of the pattern
- `is_default` (boolean) - Whether this is a default pattern (admin only, defaults to false)

**Example Request:**
```json
POST /patterns.php?action=create
Content-Type: application/json
X-Auth-Token: abc123xyz...

{
  "name": "My Custom Pattern",
  "version": "1.0",
  "description": "A pattern for treasure hunt game",
  "game_type": "treasure_hunt",
  "pattern_data": {
    "grid_size": 5,
    "difficulty": "medium",
    "settings": {
      "timer": 60,
      "hints": 3
    }
  },
  "is_default": false
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "name": "My Custom Pattern",
    "description": "A pattern for treasure hunt game",
    "version": "1.0",
    "game_type": "treasure_hunt",
    "pattern_data": "{\"grid_size\":5,\"difficulty\":\"medium\",\"settings\":{\"timer\":60,\"hints\":3}}",
    "is_default": 0,
    "owner_type": "client",
    "owner_id": 45,
    "created_by_email": "user@example.com",
    "created_at": "2024-01-15 10:30:00",
    "updated_at": "2024-01-15 10:30:00"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
  ```json
  {"error": "Pattern name is required"}
  {"error": "Version is required"}
  {"error": "Game type is required"}
  {"error": "Pattern data is required"}
  {"error": "Invalid JSON pattern data"}
  ```
- `401` - Authentication required or invalid token
  ```json
  {"error": "Authentication required"}
  {"error": "Invalid or expired token"}
  ```
- `403` - Permission denied (e.g., non-admin trying to set is_default)
  ```json
  {"error": "Only admins can create default patterns"}
  ```

---

### 2. List Patterns
Retrieves all patterns accessible by the authenticated user.

**Endpoint:** `GET /patterns.php?action=list`

**Headers:**
```
X-Auth-Token: your-auth-token-here
```

**Optional Query Parameters:**
- `game_type` (string) - Filter patterns by game type

**Example Request:**
```
GET /patterns.php?action=list&game_type=treasure_hunt
X-Auth-Token: abc123xyz...
```

**Success Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Default Pattern",
      "description": "Default pattern for all users",
      "version": "1.0",
      "game_type": "treasure_hunt",
      "pattern_data": "{...}",
      "is_default": 1,
      "owner_type": "system",
      "owner_id": null,
      "created_by_email": "admin@taghunter.fr",
      "created_at": "2024-01-01 00:00:00",
      "updated_at": "2024-01-01 00:00:00"
    },
    {
      "id": 123,
      "name": "My Custom Pattern",
      "description": "A pattern for treasure hunt game",
      "version": "1.0",
      "game_type": "treasure_hunt",
      "pattern_data": "{...}",
      "is_default": 0,
      "owner_type": "client",
      "owner_id": 45,
      "created_by_email": "user@example.com",
      "created_at": "2024-01-15 10:30:00",
      "updated_at": "2024-01-15 10:30:00"
    }
  ]
}
```

**Note:**
- Admins can see all patterns
- Clients can see default patterns and their own patterns

---

### 3. Get Single Pattern
Retrieves a specific pattern by ID.

**Endpoint:** `GET /patterns.php?action=get&id={pattern_id}`

**Headers:**
```
X-Auth-Token: your-auth-token-here
```

**Example Request:**
```
GET /patterns.php?action=get&id=123
X-Auth-Token: abc123xyz...
```

**Success Response (200):**
```json
{
  "data": {
    "id": 123,
    "name": "My Custom Pattern",
    "description": "A pattern for treasure hunt game",
    "version": "1.0",
    "game_type": "treasure_hunt",
    "pattern_data": "{\"grid_size\":5,\"difficulty\":\"medium\"}",
    "is_default": 0,
    "owner_type": "client",
    "owner_id": 45,
    "created_by_email": "user@example.com",
    "created_at": "2024-01-15 10:30:00",
    "updated_at": "2024-01-15 10:30:00"
  }
}
```

**Error Responses:**
- `400` - Pattern ID required
  ```json
  {"error": "Pattern ID is required"}
  ```
- `403` - Access denied
  ```json
  {"error": "Access denied"}
  ```
- `404` - Pattern not found
  ```json
  {"error": "Pattern not found"}
  ```

---

### 4. Update Pattern
Updates an existing pattern.

**Endpoint:** `POST /patterns.php?action=update` or `PUT /patterns.php?action=update`

**Headers:**
```
Content-Type: application/json
X-Auth-Token: your-auth-token-here
```

**Required Parameters:**
- `id` (integer) - Pattern ID (can be in query string or request body)

**Optional Parameters:**
- `name` (string)
- `description` (string)
- `game_type` (string)
- `pattern_data` (object or string)
- `is_default` (boolean) - Admin only

**Example Request:**
```json
POST /patterns.php?action=update
Content-Type: application/json
X-Auth-Token: abc123xyz...

{
  "id": 123,
  "name": "Updated Pattern Name",
  "pattern_data": {
    "grid_size": 7,
    "difficulty": "hard"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "name": "Updated Pattern Name",
    "description": "A pattern for treasure hunt game",
    "version": "1.0",
    "game_type": "treasure_hunt",
    "pattern_data": "{\"grid_size\":7,\"difficulty\":\"hard\"}",
    "is_default": 0,
    "owner_type": "client",
    "owner_id": 45,
    "created_by_email": "user@example.com",
    "created_at": "2024-01-15 10:30:00",
    "updated_at": "2024-01-15 14:45:00"
  }
}
```

**Error Responses:**
- `400` - Pattern ID required or invalid data
- `403` - Access denied (not owner or trying to set default as non-admin)
- `404` - Pattern not found

---

### 5. Delete Pattern
Deletes a pattern.

**Endpoint:** `POST /patterns.php?action=delete&id={pattern_id}` or `DELETE /patterns.php?action=delete&id={pattern_id}`

**Headers:**
```
X-Auth-Token: your-auth-token-here
```

**Example Request:**
```
DELETE /patterns.php?action=delete&id=123
X-Auth-Token: abc123xyz...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Pattern deleted successfully"
}
```

**Error Responses:**
- `400` - Pattern ID required
- `403` - Access denied (not owner)
- `404` - Pattern not found

---

### 6. Upload Pattern (Without Auth Token)
Special endpoint for uploading patterns using email authentication.

**Endpoint:** `POST /patterns.php?action=upload`

**Headers:**
```
Content-Type: application/json
```

**Required Parameters:**
- `email` (string) - Email of the user (must exist in admin_users or clients table)
- `name` (string) - Pattern name
- `pattern_data` (object or string) - JSON pattern data
- `game_type` (string) - Game type
- `version` (string) - Version identifier

**Optional Parameters:**
- `is_default` (boolean) - Whether this is a default pattern (defaults to false)

**Example Request:**
```json
POST /patterns.php?action=upload
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "Uploaded Pattern",
  "version": "1.0",
  "game_type": "treasure_hunt",
  "pattern_data": {
    "grid_size": 5,
    "difficulty": "medium"
  },
  "is_default": false
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 124,
    "name": "Uploaded Pattern",
    "description": null,
    "version": "1.0",
    "game_type": "treasure_hunt",
    "pattern_data": "{\"grid_size\":5,\"difficulty\":\"medium\"}",
    "is_default": 0,
    "owner_type": "client",
    "owner_id": 45,
    "created_by_email": "user@example.com",
    "created_at": "2024-01-15 10:30:00",
    "updated_at": "2024-01-15 10:30:00"
  }
}
```

**Error Responses:**
- `404` - User with email not found
  ```json
  {"error": "User with this email not found"}
  ```

---

## Common Error Codes

- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (missing or invalid auth token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `405` - Method Not Allowed (wrong HTTP method)
- `500` - Internal Server Error

---

## Important Notes

1. **Pattern Data Format:** The `pattern_data` field accepts either a JSON object or a JSON string. It will be stored as a string in the database.

2. **Ownership:** Users can only update/delete patterns they own, unless they are admins. Default patterns are read-only for non-admins.

3. **Default Patterns:** Only admins can create or modify default patterns. Default patterns are visible to all users.

4. **Version Field:** The version field is required for the `create` endpoint. Use semantic versioning (e.g., "1.0", "1.1", "2.0").

5. **Authentication:** The `upload` endpoint uses email-based authentication, while all other endpoints require a valid auth token in the `X-Auth-Token` header.

---

## Example Workflow for Playground App

### Step 1: Authenticate User
```
POST /auth.php?action=login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Step 2: Store Auth Token
Save the token from the login response for subsequent requests.

### Step 3: Create a New Pattern
```
POST /patterns.php?action=create
X-Auth-Token: {saved-token}
{
  "name": "Level 1 Pattern",
  "version": "1.0",
  "game_type": "treasure_hunt",
  "pattern_data": {...}
}
```

### Step 4: List All Available Patterns
```
GET /patterns.php?action=list&game_type=treasure_hunt
X-Auth-Token: {saved-token}
```

### Step 5: Retrieve Specific Pattern
```
GET /patterns.php?action=get&id=123
X-Auth-Token: {saved-token}
```

### Step 6: Update Pattern
```
POST /patterns.php?action=update
X-Auth-Token: {saved-token}
{
  "id": 123,
  "name": "Updated Level 1 Pattern",
  "pattern_data": {...}
}
```

### Step 7: Delete Pattern
```
DELETE /patterns.php?action=delete&id=123
X-Auth-Token: {saved-token}
```
