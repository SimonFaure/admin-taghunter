# Authentication

Token + OTP auth for the admin app and its clients. Entry points: [backend/api/secure_auth.php](../backend/api/secure_auth.php), [src/contexts/SecureAuthContext.tsx](../src/contexts/SecureAuthContext.tsx), [src/lib/secureAuth.ts](../src/lib/secureAuth.ts), [src/components/SecureLoginForm.tsx](../src/components/SecureLoginForm.tsx).

## Model

- **Session token** - 24 h, SHA-256 hashed at rest, refreshable, revoked on logout. Sent via `X-Auth-Token` header.
- **OTP** - 6-digit code, 15 min TTL, single-use. Delivered via PHP `mail()` (swap for SendGrid/SES/Mailgun in prod).
- **Long-lived "remember me" token** - 30 day TTL, `long_lived = 1` in `auth_tokens`. Its only job is to let a subsequent email/password login skip OTP. It's never used as a session token itself - successful smart login still mints a fresh 24 h session token.
- **Rate limiting** - 5 failed attempts/hour/email, 10 failed attempts/15 min/IP, 3 code requests/hour/email. HTTP 429 on overflow.
- **Security headers** applied to every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.
- **CORS allowlist:** `http://localhost:{5173,3000,4173}` in dev, `https://admin.taghunter.fr` in prod. Everything else → 403.

Token expiry constants live in `backend/utils/TokenManager.php`:

```php
const TOKEN_EXPIRY_HOURS = 24;
const LONG_LIVED_TOKEN_EXPIRY_DAYS = 30;
```

## Schema

**`auth_tokens`** - `id`, `client_id`, `token` (hashed), `expires_at`, `created_at`, `ip_address`, `user_agent`, `revoked`, `long_lived`.

**`login_attempts`** - `id`, `email`, `ip_address`, `success`, `attempted_at`, `failure_reason`. Used by the rate limiter.

**`one_time_codes`** - `id`, `email`, `code`, `expires_at`, `used`, `created_at`, `ip_address`.

### Applying the `long_lived` column

Required for Remember Me. Symptom if missing: the frontend tries `request-code` or `login` and gets an HTML error page, which surfaces as `Unexpected token '<', "<html><hea"... is not valid JSON` in the console.

Preferred:

```bash
php backend/apply_long_lived_migration.php
```

Or hit `http://localhost:5173/backend/api/fix_auth_tokens.php` in the browser. Verify with `http://localhost:5173/backend/api/health_check.php` → expect `"long_lived_column": "ok"`.

Manual SQL (idempotent, MySQL):

```sql
SET @dbname = DATABASE();
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens' AND COLUMN_NAME = 'long_lived') > 0,
  'SELECT 1',
  'ALTER TABLE auth_tokens ADD COLUMN long_lived BOOLEAN DEFAULT FALSE AFTER revoked'
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
```

## Endpoints

All `POST`, all under `backend/api/secure_auth.php`.

### `action=login` - smart login

Validates email + password, then checks for a valid `long_lived` token for that user.

```json
{ "email": "user@example.com", "password": "…" }
```

Remember Me active (skip OTP):

```json
{ "success": true, "code_required": false,
  "data": { "token": "…", "expires_at": "…", "user_id": "…", "email": "…",
            "name": "…", "license_type": "…", "billing_up_to_date": true } }
```

No Remember Me (OTP sent):

```json
{ "success": true, "code_required": true,
  "message": "Code sent to your email", "expires_in": 900 }
```

### `action=request-code`

Legacy "Send Code" flow (still supported).

```json
{ "email": "…", "type": "otp" }   // or "magic_link"
```

### `action=verify-code`

```json
{ "email": "…", "code": "123456", "remember_me": true }
```

`remember_me: true` creates a 30-day `long_lived` token alongside the normal session token.

Response on success includes the session token, `expires_at`, and the user profile.

### `action=validate`

```json
{ "token": "…" }   // or X-Auth-Token header
```

Returns `{ valid, client_id, email, name, expires_at }`.

### `action=refresh`

Issues a new session token given a valid current one. The long-lived token is unaffected.

### `action=logout`

Revokes the provided session token. Long-lived tokens are untouched unless explicitly revoked.

## Flows

**First login**
```
email+pw  →  /login  →  code_required: true
          →  /verify-code (+remember_me)  →  session token (and long-lived if opted in)
```

**Returning user within 30 days (Remember Me)**
```
email+pw  →  /login  →  code_required: false, new session token
```

**Returning user without Remember Me**
```
email+pw  →  /login  →  code_required: true  →  /verify-code  →  session token
```

## Implementation

- **Backend:** `/login` calls `TokenManager::hasValidLongLivedToken($db, $userId, $userType)`. If present, mint session token and return `code_required: false`. Otherwise, send OTP.
- **Frontend:** `SecureLoginForm` has a single "Login" button that calls `secureAuth.login(email, pw)` and switches to the code input only if `result.code_required`. `AuthContext.login` accepts an optional `directData` arg for the smart-login path so it doesn't re-call `verifyCode`.

Wrap the app in `<SecureAuthProvider>`; consume with `useSecureAuth()` → `{ user, isAuthenticated, logout }`.

## cURL examples

```bash
# request code
curl -X POST /backend/api/secure_auth.php?action=request-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":"otp"}'

# verify
curl -X POST /backend/api/secure_auth.php?action=verify-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'

# validate
curl -X POST /backend/api/secure_auth.php?action=validate \
  -H "X-Auth-Token: …" -d '{}'
```

## Error strings (stable)

`Invalid email address` · `Email not registered` · `Too many attempts. Please try again later.` · `Too many code requests. Please try again later.` · `Invalid or expired code` · `Invalid or expired token` · `Failed to send code. Please try again.`

## Troubleshooting Remember Me

"Always asks for OTP":
```sql
SELECT * FROM auth_tokens
 WHERE user_id = '…' AND long_lived = 1 AND expires_at > NOW();
```
No row → the opt-in checkbox wasn't sent or the migration didn't land. Wrong password also bypasses the long-lived check by design, so verify creds first.

## Housekeeping

Run via cron (not per-request):

- `TokenManager::cleanupExpiredTokens()`
- `OTPManager::cleanupExpiredCodes()`
- `RateLimiter::cleanupOldAttempts()`

## Operational notes

- Never put tokens in URLs - headers or bodies only. Consider `httpOnly` cookies in prod.
- Email delivery is `mail()` today - for production, move to a proper SMTP provider with bounce handling.
- Indexes on `auth_tokens(user_id, long_lived, expires_at)` and `login_attempts(email, attempted_at)` keep rate limiting cheap. Consider caching validated tokens in Redis at higher traffic.
