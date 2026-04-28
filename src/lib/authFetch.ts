// Thin fetch wrapper that attaches the current auth token to outgoing requests.
// Admin views that were built against session-cookie auth (`credentials: 'include'`)
// need to also send the Bearer/X-Auth-Token from studio's localStorage since
// secure_auth.php is token-only and does not set a PHP session cookie.
//
// Usage:
//   authFetch(url)                          // GET, auth header attached
//   authFetch(url, { method: 'POST', body }) // POST, auth header + your headers merged

const TOKEN_KEY = 'auth_token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = readToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('X-Auth-Token')) {
    headers.set('X-Auth-Token', token);
  }
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  });
}
