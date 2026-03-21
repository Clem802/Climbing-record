# Climbing Boulder Tracker — Claude Context

## Environment
- Node.js is installed at `C:\Program Files\nodejs\` but NOT in bash PATH
- Fix: `export PATH="/c/Program Files/nodejs:$PATH"` at start of any bash session
- Use `npm install --prefix server` and `npm install --prefix client` (not from subdirs)
- `better-sqlite3` requires native build; use `npm install --ignore-scripts` only if gyp fails
- Tests: `npm test --prefix server` (Jest) and `npm test --prefix client` (Vitest)

## Architecture
- Monorepo: `/client` (React+Vite+Tailwind+Recharts) + `/server` (Express+SQLite)
- Vite proxy: `/api/*` → `localhost:3001` — no CORS config needed in dev
- JWT in httpOnly SameSite=Strict cookies (7-day expiry); never in localStorage
- SQLite via better-sqlite3 (sync API); `:memory:` DB when `NODE_ENV=test`
- Points computed server-side only via `server/utils/points.js`

## Key Rules
- `/api/sessions/full` route MUST be registered before `/:id` in Express
- `requireActiveSubscription` must query live DB — never read from JWT payload
- Subscription allowlist: `Set(['active', 'trial'])` — not a denylist
- Boulder rows only inserted for topped boulders; absent = not attempted

## Design System (Spider Climbing theme)
- Brand: `#cd2927` (red), dark: `#961816` — Tailwind class `text-brand` / `bg-brand`
- Light theme: white cards, `bg-gray-50` page backgrounds, `shadow-natural`
- Buttons: always `rounded-full` (pill shape)
- Inputs: `rounded-xl` with `focus:border-brand focus:ring-1 focus:ring-brand`

## Test Quirks
- `getByText('0')` will fail if multiple stats show 0 — use `parentElement.textContent` instead
- `getByText('1')` in BoulderCard matches both the number label AND the button — use `getByRole('button', { name: '1' })`

## Seed / Demo Data
- `npm run seed` — creates admin@climbing.app/admin123 and demo@climbing.app/demo123
- Re-running seed on existing DB will fail (UNIQUE constraint) — delete `server/data/climbing.db` first
