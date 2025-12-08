# Secure Authentication System

This application now includes a comprehensive secure authentication system with token-based authentication, rate limiting, and OTP verification.

## Features

### 1. Token-Based Authentication
- Secure, time-limited tokens (24-hour expiry)
- Tokens are hashed using SHA-256 before storage
- Automatic token refresh before expiration
- Token revocation on logout

### 2. Rate Limiting
- **Email-based**: Maximum 5 failed attempts per hour per email
- **IP-based**: Maximum 10 failed attempts per 15 minutes per IP
- **Code requests**: Maximum 3 code requests per hour per email
- Automatic lockout with exponential backoff
- Returns HTTP 429 (Too Many Requests) when limits exceeded

### 3. One-Time Password (OTP) System
- 6-digit codes sent via email
- Codes expire after 15 minutes
- Single-use codes (cannot be reused)
- Automatic cleanup of expired codes

### 4. Security Headers
All API responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` for camera, microphone, geolocation

### 5. CORS Protection
- Only specific origins are allowed
- Development: `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4173`
- Production: `https://admin.taghunter.fr`
- Rejects all other origins with HTTP 403

### 6. Comprehensive Logging
All authentication attempts are logged with:
- Timestamp
- IP address
- Email attempted
- Success/failure status
- Failure reason (if unsuccessful)
- User agent

## Database Schema

### `auth_tokens`
Stores active authentication tokens:
- `id` (uuid) - Primary key
- `client_id` (uuid) - Foreign key to clients
- `token` (text) - Hashed token
- `expires_at` (timestamptz) - Expiration timestamp
- `created_at` (timestamptz) - Creation timestamp
- `ip_address` (text) - Client IP
- `user_agent` (text) - Browser/client info
- `revoked` (boolean) - Revocation status

### `login_attempts`
Tracks login attempts for rate limiting:
- `id` (uuid) - Primary key
- `email` (text) - Email attempted
- `ip_address` (text) - IP address
- `success` (boolean) - Success status
- `attempted_at` (timestamptz) - Attempt timestamp
- `failure_reason` (text) - Reason if failed

### `one_time_codes`
Stores OTP codes:
- `id` (uuid) - Primary key
- `email` (text) - Email for code
- `code` (text) - OTP code
- `expires_at` (timestamptz) - Expiration timestamp
- `used` (boolean) - Usage status
- `created_at` (timestamptz) - Creation timestamp
- `ip_address` (text) - Requester IP

## API Endpoints

### 1. Request OTP Code
```
POST /backend/api/secure_auth.php?action=request-code

Request:
{
  "email": "user@example.com",
  "type": "otp"  // or "magic_link"
}

Response:
{
  "success": true,
  "message": "Code sent to your email",
  "expires_in": 900  // seconds
}
```

### 2. Verify Code & Login
```
POST /backend/api/secure_auth.php?action=verify-code

Request:
{
  "email": "user@example.com",
  "code": "123456"
}

Response:
{
  "success": true,
  "data": {
    "token": "secure-token-here",
    "expires_at": "2024-12-09T10:30:00Z",
    "client_id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

### 3. Validate Token
```
POST /backend/api/secure_auth.php?action=validate

Request:
{
  "token": "your-token"
}

Response:
{
  "valid": true,
  "client_id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "expires_at": "2024-12-09T10:30:00Z"
}
```

### 4. Logout
```
POST /backend/api/secure_auth.php?action=logout

Request:
{
  "token": "your-token"
}

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 5. Refresh Token
```
POST /backend/api/secure_auth.php?action=refresh

Request:
{
  "token": "current-token"
}

Response:
{
  "success": true,
  "data": {
    "token": "new-token",
    "expires_at": "2024-12-09T10:30:00Z"
  }
}
```

## Frontend Usage

### Using the SecureAuthContext

```tsx
import { SecureAuthProvider, useSecureAuth } from './contexts/SecureAuthContext';

// Wrap your app with the provider
function App() {
  return (
    <SecureAuthProvider>
      <YourApp />
    </SecureAuthProvider>
  );
}

// Use the hook in your components
function YourComponent() {
  const { user, isAuthenticated, logout } = useSecureAuth();

  if (!isAuthenticated) {
    return <SecureLoginForm onSuccess={() => {}} />;
  }

  return (
    <div>
      <p>Welcome, {user?.name || user?.email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Using the SecureLoginForm Component

```tsx
import SecureLoginForm from './components/SecureLoginForm';

function LoginPage() {
  const handleSuccess = (data) => {
    console.log('Logged in:', data);
    // Redirect or update state
  };

  return <SecureLoginForm onSuccess={handleSuccess} />;
}
```

### Direct API Usage

```tsx
import { secureAuth } from './lib/secureAuth';

// Request a code
const result = await secureAuth.requestCode('user@example.com');

// Verify code and login
const loginResult = await secureAuth.verifyCode('user@example.com', '123456');

// Validate current token
const isValid = await secureAuth.validateToken();

// Logout
await secureAuth.logout();

// Refresh token
await secureAuth.refreshToken();
```

## Error Handling

The system returns specific error messages for different scenarios:

- **Invalid email**: "Invalid email address"
- **Email not registered**: "Email not registered"
- **Rate limited (email)**: "Too many attempts. Please try again later."
- **Rate limited (IP)**: "Too many attempts. Please try again later."
- **Too many codes**: "Too many code requests. Please try again later."
- **Invalid code**: "Invalid or expired code"
- **Invalid token**: "Invalid or expired token"
- **Email send failure**: "Failed to send code. Please try again."

## Security Best Practices

1. **Never expose tokens in URLs** - Always use headers or request bodies
2. **Store tokens securely** - Use httpOnly cookies in production if possible
3. **Implement HTTPS** - Always use HTTPS in production
4. **Monitor logs** - Regularly check `login_attempts` and `api_logs` tables
5. **Clean up old data** - Run cleanup functions regularly:
   - `TokenManager::cleanupExpiredTokens()`
   - `OTPManager::cleanupExpiredCodes()`
   - `RateLimiter::cleanupOldAttempts()`

## Email Configuration

Currently using PHP's built-in `mail()` function. For production, consider:

1. **SMTP Service**: Use a service like SendGrid, Mailgun, or AWS SES
2. **Email Templates**: Create HTML templates for better user experience
3. **Rate Limiting**: Implement email-specific rate limiting
4. **Delivery Monitoring**: Track email delivery success/failure

## Migration from Old Auth

If migrating from the old authentication system:

1. Keep the old system running temporarily
2. Add a feature flag to toggle between old and new auth
3. Migrate users gradually by asking them to re-authenticate
4. Once all users migrated, remove old auth code
5. Update all API calls to use token-based authentication

## Testing

Test the authentication flow:

```bash
# Request code
curl -X POST http://localhost/backend/api/secure_auth.php?action=request-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":"otp"}'

# Verify code (use code from email)
curl -X POST http://localhost/backend/api/secure_auth.php?action=verify-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'

# Validate token
curl -X POST http://localhost/backend/api/secure_auth.php?action=validate \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: your-token-here" \
  -d '{}'
```

## Performance Considerations

1. **Database Indexes**: Ensure indexes exist on frequently queried columns
2. **Token Cleanup**: Run cleanup tasks via cron job (not on every request)
3. **Caching**: Consider caching valid tokens in Redis/Memcached
4. **Connection Pooling**: Use database connection pooling for high traffic

## Future Enhancements

Consider adding:

1. **2FA Support**: Add TOTP-based 2FA
2. **Biometric Auth**: Support WebAuthn for biometric login
3. **Session Management**: Allow users to view/revoke active sessions
4. **IP Whitelisting**: Allow restricting access by IP ranges
5. **Geolocation Checks**: Flag suspicious logins from new locations
6. **Device Fingerprinting**: Track and verify known devices
