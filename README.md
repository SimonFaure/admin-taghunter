# admin-taghunter

Central admin console + PHP backend for the Taghunter ecosystem. Admins manage clients, scenarios, patterns, cards, devices, and analytics. Also serves as the HTTP API for the [Creator](../taghunter_creator/) and [Playground](../taghunter_playground/) Electron apps.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind
- **Backend:** vanilla PHP + MySQL 8, under [backend/](backend/)
- **Auth:** email + OTP, 24h session tokens, optional 30-day "remember me"

## Getting started

```bash
npm install
npm run dev          # Vite dev server, proxies /backend to the PHP host
```

Backend DB config: [backend/config/database.php](backend/config/database.php).

## Layout

- [src/](src/) - React app
- [backend/api/](backend/api/) - HTTP endpoints (query-string `action` dispatch)
- [backend/database/](backend/database/) - SQL migrations
- [backend/utils/](backend/utils/) - shared PHP helpers (Logger, TokenManager, RateLimiter, OTPManager)
- [cards/](cards/) - per-client CSV card files (gitignored, `.htaccess`-protected)
- [media/](media/) - scenario media uploads
- [docs/](docs/) - feature documentation (below)

## Documentation

- [docs/auth.md](docs/auth.md) - token auth, OTP, rate limiting, Remember Me, `long_lived` migration
- [docs/cards.md](docs/cards.md) - client CSV cards + device tracking, sync/repair scripts
- [docs/creator-integration.md](docs/creator-integration.md) - Creator ↔ Admin API contract, Creator logging, 500 triage
- [docs/playground-api.md](docs/playground-api.md) - Pattern CRUD for Playground, token auth vs email upload
- [docs/product-scenarios.md](docs/product-scenarios.md) - Taghunter Product vs custom client scenario classification
