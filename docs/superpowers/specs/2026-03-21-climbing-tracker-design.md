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
  role TEXT NOT NULL DEFAULT 'user',          -- 'admin' | 'user'
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- 'active' | 'inactive' | 'trial'
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

-- Boulder attempts (one row per boulder per session)
CREATE TABLE boulders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  boulder_number INTEGER NOT NULL CHECK (boulder_number BETWEEN 1 AND 35),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 4),
  completed BOOLEAN NOT NULL DEFAULT 1
);
-- Not-attempted boulders are simply absent from this table
-- points computed in JS/server: attempts=1→10, 2→7, 3→4, 4+→1
```

**Scoring:** 1 attempt = 10pts, 2 = 7pts, 3 = 4pts, 4+ = 1pt. Max session score = 350 (35 flashes). Points always computed server-side; client value not trusted.

---

## API

### Auth
```
POST   /api/auth/register       { email, name, password } → sets cookie
POST   /api/auth/login          { email, password } → sets cookie
POST   /api/auth/logout         clears cookie
GET    /api/auth/me             → { id, email, name, role, subscription_status }
```

### Sessions (requires auth + active/trial subscription for writes)
```
GET    /api/sessions                    user's sessions list (summary)
POST   /api/sessions                    create session + boulder rows
GET    /api/sessions/:id                session detail with boulders
PUT    /api/sessions/:id                edit session (replaces boulder rows)
DELETE /api/sessions/:id                delete session
```

### Admin (requires auth + role=admin)
```
GET    /api/admin/users                       all users with stats
PATCH  /api/admin/users/:id/subscription      toggle subscription status
GET    /api/admin/users/:id/sessions          user's session history
DELETE /api/admin/users/:id                   delete user
GET    /api/admin/stats                       { totalUsers, activeSubscribers, totalSessions }
```

**Server-side enforcement:**
- Every session route checks `session.user_id === req.user.id`
- Subscription gate: POST/PUT sessions return 403 if status = 'inactive'
- Boulder numbers validated 1–35, attempts validated 1–4
- Points computed server-side

---

## Frontend Pages

| Route | Description |
|---|---|
| `/login` | Email/password login form. Redirects to `/dashboard` if already authed |
| `/register` | Sign up form. Email format + min 8 char password validation |
| `/dashboard` | Session history table + "New Session" button. Inactive users see upgrade prompt |
| `/sessions/new` | Date/location/notes + 5×7 boulder grid + sticky summary bar. On submit: summary modal → redirect |
| `/sessions/:id` | Same grid layout, pre-populated, editable. Save changes button |
| `/progress` | 5 Recharts charts with 30d/90d/all-time filter. Subscription-gated |
| `/admin` | Admin only. User table + stats. Click user → their sessions |

---

## Key Components

**`BoulderCard`**
- Boulder number label
- Button group: `[1] [2] [3] [4+] [—]`
- Default state: `[—]` (not attempted)
- Color coding: green (flash), yellow (2), orange (3), red (4+), grey (not attempted)
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
- Subscription check for gated pages (progress, new session)

---

## Progress Charts (Recharts)

All charts have a date range filter: Last 30 days / Last 90 days / All time.

1. **Score Over Time** — line chart, session score by date
2. **Completion Rate** — line chart, % boulders completed per session
3. **Flash Rate** — bar chart, number of 1st-attempt completions per session
4. **Average Attempts** — line chart, rolling avg attempts per completed boulder
5. **Points Breakdown** — stacked bar chart, boulders scoring 10/7/4/1 pts per session

---

## Auth & Security

- JWT stored in httpOnly, SameSite=Strict cookie
- 7-day expiry; `GET /api/auth/me` called on app load to hydrate auth context
- 401 from `/me` → redirect to login
- bcrypt 10 salt rounds
- All user data strictly isolated (ownership check on every route)
- Admin can read any user's data but cannot modify session data

---

## Seed Data

Run with `npm run seed`. Idempotent (checks existence before inserting).

- `admin@climbing.app` / `admin123` — role: admin, status: active
- `demo@climbing.app` / `demo123` — role: user, status: active
- 10 sessions for demo user spread across last 90 days
- Various locations (e.g. "The Reach", "Boulder World", "VCC")
- Randomised but realistic attempt distributions for meaningful chart data

---

## Edge Cases

| Case | Behaviour |
|---|---|
| All boulders `[—]` on submit | Allowed — score 0, completed 0, stored normally |
| Multiple sessions same date/location | Allowed |
| Inactive user tries to log session | 403 from server; upgrade prompt shown client-side |
| Boulder grid on mobile | 5-column layout with compact cards, large tap targets |
| Admin deletes user | Cascades: sessions + boulders deleted |

---

## Upgrade Prompt

Inactive users see a static banner/page:
> "Your account is inactive. Contact your administrator to reactivate your subscription."

No payment flow. Mock CTA button included for future extension.

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
