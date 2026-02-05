# Remember Me Feature - Smart Login

This document explains the enhanced "Remember Me" feature that intelligently skips OTP verification for trusted users.

## Overview

The secure authentication system now supports smart login that:
- Checks if user has a valid "Remember Me" token from within the last 30 days
- If yes, logs them in directly with just email/password (no OTP needed)
- If no, sends an OTP code for verification
- Provides seamless UX with a single "Login" button instead of separate "Send Code" and "Verify" steps

## Database Schema

The `auth_tokens` table includes a `long_lived` column for tracking remember me tokens:

```sql
ALTER TABLE auth_tokens ADD COLUMN long_lived BOOLEAN DEFAULT FALSE;
```

Run the migration if not already applied:
```bash
php backend/apply_long_lived_migration.php
```

## How It Works

### Enhanced Login Flow

1. **User Clicks "Login"**:
   - User enters email and password
   - Clicks the "Login" button (not "Send Code")
   - System checks credentials

2. **Backend Smart Check**:
   - Validates email/password
   - Checks if user has a valid long-lived token in the database
   - If yes → Creates new session token and logs them in directly
   - If no → Sends OTP code and shows code input form

3. **First-Time or Expired Token**:
   - User receives OTP code
   - Enters code and optionally checks "Don't ask for a code for 30 days"
   - System creates appropriate token (standard or long-lived)

4. **Subsequent Logins (within 30 days with Remember Me)**:
   - User enters email/password and clicks "Login"
   - Instantly logged in without OTP
   - No code input screen shown

### User Experience Flow

**Without Remember Me Active:**
```
[Email/Password] → Click "Login" → [OTP Code Input] → Logged In
```

**With Remember Me Active:**
```
[Email/Password] → Click "Login" → Logged In Immediately
```

## API Endpoints

### New Smart Login Endpoint

```http
POST /backend/api/secure_auth.php?action=login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response when remember me token exists (direct login):**
```json
{
  "success": true,
  "code_required": false,
  "data": {
    "token": "new_session_token...",
    "expires_at": "2024-02-15 10:30:00",
    "user_id": "client123",
    "email": "user@example.com",
    "name": "John Doe",
    "license_type": "premium",
    "billing_up_to_date": true
  }
}
```

**Response when OTP is needed:**
```json
{
  "success": true,
  "code_required": true,
  "message": "Code sent to your email",
  "expires_in": 900
}
```

### Verify Code (Still Used for Initial Setup)

```http
POST /backend/api/secure_auth.php?action=verify-code
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "remember_me": true
}
```

## Backend Implementation

### TokenManager Enhancement

Added `hasValidLongLivedToken()` method:

```php
public static function hasValidLongLivedToken(
    object $db,
    string $userId,
    string $userType = 'client'
): ?string {
    // Checks for any valid long-lived token for the user
    // Returns hashed token if found, null otherwise
}
```

### Login Endpoint Logic

1. Validate email/password
2. Check `TokenManager::hasValidLongLivedToken($db, $userId, $userType)`
3. If token exists:
   - Create new session token (standard 24h)
   - Return user data with token
   - Set `code_required: false`
4. If no token:
   - Send OTP via email
   - Return success with `code_required: true`

## Frontend Implementation

### SecureLoginForm Changes

**Button Text Changed:**
- Old: "Send Code"
- New: "Login"

**Help Text Changed:**
- Old: "Enter your credentials to receive a login code"
- New: "Enter your credentials to login"

**Login Handler:**
```typescript
const handleLogin = async (e) => {
  const result = await secureAuth.login(email, password);

  if (result.error) {
    // Show error
  } else if (result.code_required) {
    // Show code input form
    setStep('code');
  } else if (result.success && result.data) {
    // Direct login - authenticate user
    await login(email, '', false, result.data);
  }
};
```

### SecureAuth Library

New `login()` method:
```typescript
async login(email: string, password: string) {
  const result = await fetch('/secure_auth.php?action=login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  // If code_required is false and token exists, store it
  if (result.code_required === false && result.data?.token) {
    this.storeToken(result.data.token, result.data.expires_at);
  }

  return result;
}
```

### AuthContext Update

The `login()` method now accepts optional `directData`:
```typescript
login: (email, code, rememberMe?, directData?) => Promise<{success, error?}>
```

When directData is provided (from smart login), it uses that instead of calling verifyCode.

## Security Features

1. **Password Verification**: Email/password always validated before any token check
2. **Token Hashing**: Long-lived tokens stored as SHA-256 hashes
3. **New Session Tokens**: Each login creates a new session token (not reusing the long-lived one)
4. **Rate Limiting**: All login attempts are rate-limited
5. **Automatic Cleanup**: Expired tokens removed automatically
6. **IP Tracking**: Each token tracks IP address and user agent

## Configuration

Token expiry times in `TokenManager.php`:

```php
const TOKEN_EXPIRY_HOURS = 24;              // Standard session tokens
const LONG_LIVED_TOKEN_EXPIRY_DAYS = 30;    // Remember me tokens
```

## User Experience Benefits

1. **Seamless Login**: Single "Login" button handles everything
2. **No Unnecessary Steps**: OTP only required when needed
3. **Clear Feedback**: Users know immediately if code is needed
4. **Transparent**: System explains when code is sent vs instant login
5. **Security Balance**: Maintains security while improving convenience

## Testing

### Test Smart Login (With Remember Me Active)

1. Login with email/password
2. Enter OTP code
3. Check "Don't ask for a code for 30 days"
4. Logout
5. Click "Login" again with same credentials
6. Should log in IMMEDIATELY without OTP

### Test Normal Login (No Remember Me)

1. Login with email/password
2. Enter OTP code
3. Don't check "Remember me"
4. Logout
5. Click "Login" again
6. Should receive OTP code as usual

### Verify Database State

Check for long-lived tokens:
```sql
SELECT user_id, long_lived, expires_at, created_at
FROM auth_tokens
WHERE long_lived = 1
  AND expires_at > NOW()
ORDER BY created_at DESC;
```

## Troubleshooting

**Issue**: Always asks for OTP even with Remember Me

**Check**:
1. Verify long-lived token exists and isn't expired:
   ```sql
   SELECT * FROM auth_tokens
   WHERE user_id = 'your-user-id'
     AND long_lived = 1
     AND expires_at > NOW();
   ```

2. Check backend logs for login endpoint
3. Verify password is correct (wrong password will skip token check)

**Issue**: Code required is always true

**Check**:
1. `TokenManager::hasValidLongLivedToken()` implementation
2. Database connection in backend
3. User ID matches between login attempt and stored token

## Migration Notes

This update maintains backward compatibility:
- Old "Send Code" flow still works via `request-code` endpoint
- New "Login" flow provides enhanced UX
- Existing tokens continue to work
- No changes required to existing user accounts
