# Climbing Boulder Tracker — Design Spec
Date: 2026-03-21

## Overview

A multi-user full-stack web application for tracking indoor climbing boulder problems. Users log sessions, record attempts per boulder, and earn points based on efficiency. Includes admin controls, progress charts, and subscription gating.

---

## Tech Stack

- **Frontend:** React + Vite, Tailwind CSS, React Router, Recharts
- **Backend:** Node.js + Express, REST API
- **Database:** SQLite via better-sqlite3
- **Auth:** bcrypt (10 rounds), JWT in httpOnly SameSite=Strict cookie (7-day expiry)
- **Dev tooling:** concurrently (root), Vite proxy for /api

---

## Project Structure

```
climbing-record/
├── package.json              # root: concurrently dev + seed scripts
├── client/
│   ├── package.json
│   ├── vite.config.js        # proxies /api → localhost:3001
│   └── src/
│       ├── main.jsx
│       ├── App.jsx           # React Router routes
│       ├── api/              # fetch wrappers (auth, sessions, admin)
│       ├── components/       # BoulderCard, SessionSummaryBar, Toast, ProtectedRoute
│       ├── pages/            # Login, Register, Dashboard, SessionNew, SessionDetail, Progress, Admin
│       └── hooks/            # useAuth, useSessions
└── server/
    ├── package.json
    ├── index.js              # Express entry point, DB init on startup
    ├── db/
    │   ├── schema.sql        # table definitions
    │   └── seed.js           # idempotent seed: admin + demo user + 10 sessions
    ├── middleware/
    │   ├── auth.js           # JWT cookie verification
    │   └── requireAdmin.js
    └── routes/
        ├── auth.js           # register, login, logout, me
        ├── sessions.js       # session + boulder CRUD
        └── admin.js          # user management, stats
```

---

## Data Model

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',                   -- 'admin' | 'user'
  subscription_status TEXT NOT NULL DEFAULT 'trial',   -- 'active' | 'inactive' | 'trial'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Boulder attempts (one row per successfully completed boulder per session)
-- Not-attempted or not-completed boulders are simply absent from this table
CREATE TABLE boulders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  boulder_number INTEGER NOT NULL CHECK (boulder_number BETWEEN 1 AND 35),
  attempts INTEGER NOT NULL CHECK (attempts >= 1)
  -- attempts stores the actual count (1, 2, 3, or 4+)
  -- The UI ceiling is 4: selecting [4+] stores 4; any real count ≥4 scores 1pt
  -- Scoring: 1→10pts, 2→7pts, 3→4pts, ≥4→1pt (computed, never stored)
);
```

**Attempts semantics:** The `boulders` table only contains rows for boulders the user successfully topped (completed). The [4+] button stores `attempts = 4` in the DB; the scoring rule is `attempts >= 4 → 1pt`. This makes 4 the effective ceiling for scoring purposes. There is no "attempted but not topped" state — boulders are either topped (row exists) or not attempted / not topped (row absent).

**Scoring:** 1 attempt = 10pts, 2 = 7pts, 3 = 4pts, ≥4 = 1pt. Max session score = 350 (35 flashes). Points always computed server-side; client value not trusted.

---

## API

### Auth
```
POST   /api/auth/register       { email, name, password } → sets cookie
POST   /api/auth/login          { email, password } → sets cookie
POST   /api/auth/logout         clears cookie
GET    /api/auth/me             → { id, email, name, role, subscription_status }
```

**JWT expiry:** 7-day fixed expiry. Tokens are not refreshed on activity — when the cookie expires the user must log in again. `GET /api/auth/me` returns 401 on expiry → client redirects to `/login`.

### Sessions

Reads (`GET`) are available to all authenticated users regardless of subscription status — users can always view their own history. Writes (`POST`, `PUT`, `DELETE`) require `subscription_status = 'active'` or `'trial'`; inactive users receive 403.

```
GET    /api/sessions
  → [{ id, date, location, notes, total_points, completed_count, flash_count, created_at }, ...]

POST   /api/sessions
  body: {
    date: "2026-03-21",
    location: "The Reach",
    notes: "optional",
    boulders: [
      { boulder_number: 1, attempts: 1 },
      { boulder_number: 4, attempts: 3 },
      ...
    ]
  }
  → { id, date, location, notes, total_points, completed_count, flash_count, boulders: [...] }

GET    /api/sessions/:id
  → { id, date, location, notes, total_points, completed_count, flash_count,
      boulders: [{ id, boulder_number, attempts, points }, ...] }

PUT    /api/sessions/:id
  body: same shape as POST body
  → same response shape as GET /api/sessions/:id
  behaviour: replaces all boulder rows for the session atomically

DELETE /api/sessions/:id
  → 204 No Content
```

### Admin (requires auth + role=admin)
```
GET    /api/admin/users
  → [{ id, email, name, role, subscription_status, created_at,
       total_sessions, last_session_date }, ...]

PATCH  /api/admin/users/:id/subscription
  body: { status: 'active' | 'inactive' | 'trial' }
  → { id, subscription_status }

GET    /api/admin/users/:id/sessions
  → same shape as GET /api/sessions (list summary)

DELETE /api/admin/users/:id
  → 204 No Content (cascades: deletes sessions + boulders)

GET    /api/admin/stats
  → { totalUsers, activeSubscribers, totalSessions }
```

**Server-side enforcement:**
- Every session route checks `session.user_id === req.user.id` (except admin routes)
- Subscription gate: POST/PUT/DELETE sessions return 403 if status = 'inactive'
- Boulder numbers validated 1–35, attempts validated ≥ 1
- Points computed server-side on every read/write

---

## Frontend Pages

| Route | Description |
|---|---|
| `/login` | Email/password login form. Redirects to `/dashboard` if already authed |
| `/register` | Sign up form. Email format + min 8 char password validation |
| `/dashboard` | Session history table + "New Session" button. Inactive users see upgrade prompt instead of "New Session"; they can still view past sessions |
| `/sessions/new` | Subscription-gated. Date/location/notes + 5×7 boulder grid + sticky summary bar. On submit: summary modal → redirect to `/dashboard` |
| `/sessions/:id` | Pre-populated editable grid. Inactive users see the session in read-only view (Save button hidden); active/trial users can edit |
| `/progress` | Subscription-gated. 5 Recharts charts with 30d/90d/all-time filter |
| `/admin` | Admin only. User table + summary stats. Click user → their session history |

**Subscription gating in `ProtectedRoute`:**
- `/sessions/new` and `/progress`: redirect inactive users to upgrade prompt page
- `/sessions/:id`: render normally but in read-only mode for inactive users (no save button); the server also rejects PUT from inactive users as a second layer

---

## Key Components

**`BoulderCard`**
- Boulder number label
- Button group: `[1] [2] [3] [4+] [—]`
- Default state: `[—]` (not attempted / not completed — boulder will not be submitted)
- Color coding: green (1/flash), yellow (2), orange (3), red (4+), grey (—)
- Clicking selected button deselects back to `[—]`
- Large touch targets for gym use

**`SessionSummaryBar`**
- Sticky bottom bar on session logging/edit pages
- Live updates: total points / boulders completed / flash count / avg attempts

**`Toast`**
- Top-right, auto-dismiss after 3s
- Success (green) and error (red) variants

**`ProtectedRoute`**
- Redirects unauthenticated users to `/login`
- Redirects non-admin users away from `/admin`
- Redirects inactive users away from `/sessions/new` and `/progress` to upgrade prompt

---

## Progress Charts (Recharts)

All charts have a date range filter: Last 30 days / Last 90 days / All time.

**Data source:** All five charts compute from the full session list returned by `GET /api/sessions` (which includes `total_points`, `completed_count`, `flash_count` per session). For the Points Breakdown and Average Attempts charts, the detailed boulder list per session is needed — these charts call `GET /api/sessions/:id` lazily per session or a single enriched list endpoint if performance requires it. For v1, client-side computation from the summary list is sufficient for charts 1–3; charts 4–5 may need per-session detail fetched on demand.

1. **Score Over Time** — line chart, `total_points` by `date`
2. **Completion Rate** — line chart, `(completed_count / 35) * 100` per session
3. **Flash Rate** — bar chart, `flash_count` per session
4. **Average Attempts** — line chart, avg attempts across all completed boulders per session
5. **Points Breakdown** — stacked bar chart, count of boulders scoring 10/7/4/1 pts per session

---

## Auth & Security

- JWT stored in httpOnly, SameSite=Strict cookie
- 7-day fixed expiry; no sliding window refresh
- `GET /api/auth/me` called on app load to hydrate auth context; 401 → redirect to login
- bcrypt 10 salt rounds
- All user data strictly isolated (ownership check on every route)
- Admin can read any user's data but cannot modify session data

---

## Post-Submit Summary Modal

After submitting a new session, a modal is shown before redirecting to `/dashboard`:

- **Total points** (e.g. "247 pts")
- **Boulders completed** (e.g. "28 / 35")
- **Flashes** (e.g. "12 flash")
- **Average attempts** (e.g. "1.8 avg")
- A "Done" button dismisses the modal and navigates to `/dashboard`
- No auto-dismiss timeout — user must tap/click Done

---

## Seed Data

Run with `npm run seed`. Idempotent (checks existence before inserting).

- `admin@climbing.app` / `admin123` — role: admin, status: active
- `demo@climbing.app` / `demo123` — role: user, status: active
- 10 sessions for demo user spread across last 90 days
- Various locations (e.g. "The Reach", "Boulder World", "VCC")
- Randomised but realistic attempt distributions for meaningful chart data (varied scores, flash rates, completion rates across sessions)

---

## Edge Cases

| Case | Behaviour |
|---|---|
| All boulders `[—]` on submit | Allowed — no boulder rows inserted, score 0, completed 0 |
| Multiple sessions same date/location | Allowed |
| Inactive user — new session | Redirected to upgrade prompt (client); 403 if API called directly (server) |
| Inactive user — view past sessions | Allowed (read-only) |
| Inactive user — edit past session | Read-only UI; 403 from server if PUT attempted |
| Boulder grid on mobile | 5-column layout with compact cards, large tap targets |
| Admin deletes user | Cascades: sessions + boulders deleted via FK ON DELETE CASCADE |

---

## Upgrade Prompt

Inactive users navigating to gated routes (`/sessions/new`, `/progress`) are redirected to `/upgrade`:
> "Your account is inactive. Contact your administrator to reactivate your subscription."

Includes a mock "Upgrade" CTA button (no payment flow). Static page only.

---

## Root Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix client\" \"npm run dev --prefix server\"",
    "seed": "node server/db/seed.js"
  }
}
```
