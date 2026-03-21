# Vercel + Neon Migration — Design Spec
_Date: 2026-03-21_

## Overview

Migrate the Climbing Boulder Tracker from a local Express+SQLite monorepo to a fully Vercel-hosted deployment. The Express backend is wrapped in a single Vercel Serverless Function; the React/Vite frontend is served as a static build. SQLite is replaced with Neon (serverless Postgres).

---

## Architecture

```
Local dev:
  client/ (Vite :5173)  --/api/* proxy-->  server/ (Express :3001)  -->  Neon Postgres

Production (Vercel):
  client/dist/ (static)
       |
  vercel.json rewrites /api/*
       |
  api/index.js (Vercel Serverless Function, wraps Express)  -->  Neon Postgres
```

No CORS changes required. The Vite proxy is dev-only and ignored on Vercel.

---

## Files Changed / Added

### New files

| File | Purpose |
|---|---|
| `api/index.js` | Vercel Function entry — re-exports `server/index.js` Express app |
| `vercel.json` | Routes `/api/*` to the function; sets `outputDirectory` to `client/dist`; sets `framework: null` |
| `server/db/migrate.js` | One-time script to create Postgres tables on Neon |
| `server/db/seed.pg.js` | Postgres variant of the seed script |
| `.env.example` | Documents required env vars |

### Modified files

| File | Change |
|---|---|
| `server/db/database.js` | Replace `better-sqlite3` with `@neondatabase/serverless`; guard against missing `DATABASE_URL` in test env |
| `server/index.js` | Remove bare `require('./db/database')` side-effect call (schema creation moves to `migrate.js`) |
| `server/routes/auth.js` | All DB calls → `async/await sql\`...\`` |
| `server/routes/sessions.js` | All DB calls → `async/await sql\`...\``; transactions via `BEGIN`/`COMMIT`; `requireActiveSubscription` made `async` |
| `server/routes/admin.js` | All DB calls → `async/await sql\`...\``; `COUNT(*)::int` casts added |
| `server/middleware/auth.js` | No change (JWT logic unchanged) |
| `package.json` | Add `"build"` and `"migrate"` scripts; add `@neondatabase/serverless` as root dependency |
| `server/package.json` | Remove `better-sqlite3` |

> **Note:** `@neondatabase/serverless` is installed at the **root** `package.json` (not `server/package.json`) so Vercel's Function bundler can resolve it from `api/index.js`.

---

## Database Schema (Postgres)

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boulders (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  boulder_number INTEGER NOT NULL CHECK (boulder_number BETWEEN 1 AND 35),
  attempts INTEGER NOT NULL CHECK (attempts >= 1)
);
```

---

## Query Layer

### `server/db/database.js`

Exports the Neon `sql` tagged-template client. Guards against `DATABASE_URL` being undefined in the test environment (tests are out of scope for this migration — see below):

```js
const { neon } = require('@neondatabase/serverless');
if (process.env.NODE_ENV !== 'test' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
module.exports = sql;
```

> **Test suite:** The existing Jest/Vitest tests relied on an in-memory SQLite DB. After this migration the test suite will not work without a test `DATABASE_URL` pointing to a separate Neon branch, or route-level mocking. This is **out of scope** for this migration and is a follow-up task.

### Query translation

All route handler functions become `async`. Express async errors are caught with try/catch and forwarded to `next(err)`.

| Before (SQLite) | After (Neon) |
|---|---|
| `db.prepare('SELECT ...').get(id)` | `const [row] = await sql\`SELECT ... WHERE id = ${id}\`` |
| `db.prepare('SELECT ...').all()` | `const rows = await sql\`SELECT ...\`` |
| `db.prepare('INSERT ...').run(...)` | `const [row] = await sql\`INSERT ... RETURNING *\`` |
| `db.transaction(fn)()` | Manual `BEGIN`/`COMMIT`/`ROLLBACK` — see Transactions section |
| `COUNT(*) as count` | `COUNT(*)::int as count` (Postgres returns string without cast) |
| `COUNT(col) as total_sessions` | `COUNT(col)::int as total_sessions` (same — all COUNT aggregates return string) |

### Transactions

`@neondatabase/serverless`'s `neon()` function does **not** share a connection between tagged-template calls — each call is a separate HTTP request. Bare `sql\`BEGIN\`` / `sql\`COMMIT\`` do **not** work as transactions (each runs on a different connection). Instead, use the `sql.transaction()` callback, which groups all queries into a single HTTP round-trip:

```js
const session = await sql.transaction(async (txSql) => {
  const [newSession] = await txSql`INSERT INTO sessions ... RETURNING *`;
  for (const b of boulders) {
    await txSql`INSERT INTO boulders (session_id, boulder_number, attempts)
      VALUES (${newSession.id}, ${b.number}, ${b.attempts})`;
  }
  return newSession;
});
```

This applies to the two transactions in `sessions.js` (POST create session and PUT update session).

### `requireActiveSubscription` middleware

This middleware is in `sessions.js` and must be converted to `async` — it queries the DB and the query is now async:

```js
async function requireActiveSubscription(req, res, next) {
  try {
    const [user] = await sql`SELECT subscription_status FROM users WHERE id = ${req.user.id}`;
    if (!user || !WRITE_ALLOWED_STATUSES.has(user.subscription_status)) {
      return res.status(403).json({ error: 'Active subscription required' });
    }
    next();
  } catch (err) {
    next(err);
  }
}
```

> **Critical:** Leaving this synchronous would make it always pass (a Promise is truthy), silently bypassing the subscription gate.

### `auth.js` — Remove `lastInsertRowid`

`auth.js` uses `result.lastInsertRowid` (a SQLite-specific property) to fetch the newly inserted user after registration. With Neon, `INSERT ... RETURNING *` returns the row directly — no secondary `SELECT` is needed. Both places in `auth.js` where `lastInsertRowid` appears must be replaced:

```js
// Before (SQLite)
const result = db.prepare('INSERT INTO users ...').run(...);
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

// After (Neon)
const [user] = await sql`INSERT INTO users ... RETURNING *`;
```

---

## Vercel Configuration

**`vercel.json`:**
```json
{
  "framework": null,
  "outputDirectory": "client/dist",
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
}
```

> `"framework": null` prevents Vercel auto-detecting the Vite project in `client/` and overriding build settings.

**`api/index.js`:**
```js
const app = require('../server/index');
module.exports = app;
```

**`package.json` scripts:**
```json
"build": "npm install --prefix client && npm run build --prefix client",
"migrate": "node server/db/migrate.js",
"seed": "node server/db/seed.pg.js"
```

---

## `server/index.js` — Remove Schema Side Effect

The current `server/index.js` has:
```js
require('./db/database'); // runs schema creation as side effect
```

After migration, `database.js` exports only the `sql` client — no side effects. This line must be removed. Schema creation is now the responsibility of `migrate.js`, run once manually before first deploy.

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel dashboard + `.env` (local) | Neon connection string (pooled endpoint recommended) |
| `JWT_SECRET` | Vercel dashboard + `.env` (local) | JWT signing secret |
| `NODE_ENV` | Auto-set by Vercel to `"production"` | Controls cookie `Secure` flag in `auth.js` — confirmed auto-set, no manual action needed |

> **`SameSite=Strict` note:** Cookies with `SameSite=Strict` are not sent on the first request from cross-site navigations (e.g. clicking a Vercel preview URL from email). Users will appear logged out on first visit from external links. This is an existing behaviour that this migration carries forward — it is not introduced by the migration and is acceptable for now.

---

## Migration & Seed Scripts

- `server/db/migrate.js` — runs `CREATE TABLE IF NOT EXISTS` for all three tables against Neon. Run once before first deploy: `npm run migrate`
- `server/db/seed.pg.js` — Postgres version of the existing seed; creates admin + demo users with 10 sessions. Run once after migrate: `npm run seed`

---

## What Does NOT Change

- JWT cookie logic (`httpOnly`, `SameSite=Strict`, 7-day expiry)
- bcrypt password hashing
- `requireAuth`, `requireAdmin` middleware logic
- `server/utils/points.js`
- All route paths and response shapes
- React frontend (zero changes)
- Vite config (proxy stays for local dev)
- Client-side API wrappers (`client/src/api/`)

---

## Deployment Steps (one-time)

1. Create Neon project → copy `DATABASE_URL` (use pooled connection string)
2. Set `DATABASE_URL` and `JWT_SECRET` in Vercel dashboard (Production + Preview environments)
3. Run `npm run migrate` locally (with `DATABASE_URL` in `.env`)
4. Run `npm run seed` locally (optional, for demo data)
5. `git push` → Vercel auto-deploys

---

## Out of Scope

- Migrating frontend to Next.js (separate project)
- Splitting Express routes into individual Vercel Functions (future optimisation)
- Fixing the test suite for Postgres (follow-up task — tests will be broken after migration)
- Authentication UI changes
- Any new features
