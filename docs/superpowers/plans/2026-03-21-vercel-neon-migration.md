# Vercel + Neon Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Climbing Boulder Tracker from Express+SQLite to Vercel Serverless Functions + Neon Postgres so the full app deploys on Vercel.

**Architecture:** The existing Express app is wrapped in a single Vercel Function at `api/index.js`. The React/Vite frontend builds to `client/dist/` and is served as a static site. SQLite is replaced with Neon Postgres via `@neondatabase/serverless`; all DB calls in routes become async/await with tagged-template SQL.

**Tech Stack:** Node.js, Express, `@neondatabase/serverless`, Vercel Serverless Functions, React/Vite, JWT/httpOnly cookies

---

## File Map

| File | Action | Change |
|---|---|---|
| `package.json` | Modify | Add `build`, `migrate`, `seed` scripts; add `@neondatabase/serverless` dependency |
| `server/package.json` | Modify | Remove `better-sqlite3` |
| `server/db/database.js` | Rewrite | Export `{ sql, withTransaction }` — `sql` for simple queries, `withTransaction` helper via `Pool` for atomic ops |
| `server/index.js` | Modify | Remove `require('./db/database')` side-effect line |
| `server/db/migrate.js` | Create | One-time Postgres schema creation script |
| `server/db/seed.pg.js` | Create | Postgres seed script (replaces `seed.js`) |
| `server/routes/auth.js` | Rewrite | async/await, `RETURNING *`, remove `lastInsertRowid` |
| `server/routes/sessions.js` | Rewrite | async/await, `withTransaction(Pool/client.query)` for atomic ops, async `requireActiveSubscription` |
| `server/routes/admin.js` | Rewrite | async/await, `COUNT()::int` casts |
| `api/index.js` | Create | Vercel Function entry point |
| `vercel.json` | Create | `framework:null`, `outputDirectory`, rewrites |
| `.env.example` | Create | Document required env vars |

---

## Prerequisites

Before starting:
1. Create a [Neon](https://neon.tech) project and copy the **pooled** connection string (`DATABASE_URL`)
2. Have a Vercel account with the project linked (`npx vercel link`)
3. Create a `.env` file at the repo root with:
   ```
   DATABASE_URL=<your-neon-pooled-connection-string>
   JWT_SECRET=<a-random-secret-at-least-32-chars>
   ```

---

## Task 1: Update dependencies

**Files:**
- Modify: `package.json`
- Modify: `server/package.json`

- [ ] **Step 1: Add `@neondatabase/serverless` to root `package.json` and update scripts**

Replace the `scripts` block and add a `dependencies` section in `package.json`:

```json
{
  "name": "climbing-record",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "build": "npm install --prefix client && npm run build --prefix client",
    "migrate": "node server/db/migrate.js",
    "seed": "node server/db/seed.js"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "ws": "^8.0.0"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Remove `better-sqlite3` from `server/package.json`**

In `server/package.json`, remove the `"better-sqlite3"` line from `dependencies`. Leave all other dependencies unchanged.

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/@neondatabase/serverless` appears at repo root.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/package.json
git commit -m "chore: swap better-sqlite3 for @neondatabase/serverless"
```

---

## Task 2: Rewrite `server/db/database.js`

**Files:**
- Rewrite: `server/db/database.js`

The `neon()` HTTP client does NOT support `.transaction()` — each tagged-template call is a separate HTTP request with no shared connection. For transactional operations, we use `Pool` from the same package, which supports `BEGIN`/`COMMIT` over a persistent WebSocket connection. We export both:
- `sql` — tagged-template function for all non-transactional queries
- `withTransaction(fn)` — helper that wraps `Pool` + `client.query()` with `BEGIN`/`COMMIT`/`ROLLBACK`

**Note:** Inside `withTransaction`, queries use the node-postgres `client.query(sql, params)` API with `$1, $2` positional params — not tagged templates. This is intentional and the only place in the codebase that uses this syntax.

- [ ] **Step 1: Replace the file contents**

```js
const { neon, Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws; // required for Pool in Node.js runtime

if (process.env.NODE_ENV !== 'test' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

async function withTransaction(fn) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { sql, withTransaction };
```

- [ ] **Step 2: Update all files that import `database.js`**

All route files currently do `const db = require('../db/database')` or `const sql = require('../db/database')`. After this change they must destructure:

```js
const { sql } = require('../db/database');
// or for sessions.js which also needs transactions:
const { sql, withTransaction } = require('../db/database');
```

This is already reflected in the rewritten route files in Tasks 5–7.

- [ ] **Step 3: Commit**

```bash
git add server/db/database.js
git commit -m "chore: replace better-sqlite3 with neon sql client and transaction helper"
```

---

## Task 3: Remove schema side-effect from `server/index.js`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Delete the side-effect require and its comment**

Remove these two lines from `server/index.js`:
```js
// Initialize DB (runs schema creation)
require('./db/database');
```

The file should start `const express = require('express');` with no DB import or comment.

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "chore: remove db schema side-effect from server entry"
```

---

## Task 4: Create `server/db/migrate.js`

**Files:**
- Create: `server/db/migrate.js`

- [ ] **Step 1: Write the migration script**

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = neon(process.env.DATABASE_URL);

  console.log('Running migrations...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS boulders (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      boulder_number INTEGER NOT NULL CHECK (boulder_number BETWEEN 1 AND 35),
      attempts INTEGER NOT NULL CHECK (attempts >= 1)
    )
  `;

  console.log('Migrations complete.');
}

migrate().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Install dotenv at root (needed to load `.env` in scripts)**

```bash
npm install dotenv
```

- [ ] **Step 3: Run migration against Neon**

```bash
npm run migrate
```

Expected output:
```
Running migrations...
Migrations complete.
```

- [ ] **Step 4: Commit**

```bash
git add server/db/migrate.js package.json package-lock.json
git commit -m "feat: add postgres migration script"
```

---

## Task 5: Rewrite `server/routes/auth.js`

**Files:**
- Rewrite: `server/routes/auth.js`

Key changes from SQLite version:
- `db.prepare(...).get/run()` → `await sql\`...\``
- `INSERT ... RETURNING *` replaces `.run()` + secondary `SELECT` with `lastInsertRowid`
- `/me` route becomes `async`

- [ ] **Step 1: Replace file contents**

```js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql } = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
};

router.post('/register', async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const email = req.body.email?.toLowerCase().trim();
    if (!email || !name || !password) return res.status(400).json({ error: 'All fields required' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await sql`
      INSERT INTO users (email, name, password_hash)
      VALUES (${email}, ${name.trim()}, ${password_hash})
      RETURNING id, email, name, role, subscription_status
    `;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, subscription_status: user.subscription_status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, subscription_status: user.subscription_status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, subscription_status: user.subscription_status } });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user] = await sql`
      SELECT id, email, name, role, subscription_status FROM users WHERE id = ${req.user.id}
    `;
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: migrate auth routes to neon postgres"
```

---

## Task 6: Rewrite `server/routes/sessions.js`

**Files:**
- Rewrite: `server/routes/sessions.js`

Key changes:
- All handlers become `async`
- `requireActiveSubscription` becomes `async`
- Both transactions use `sql.transaction(async txSql => { ... })`
- `lastInsertRowid` removed (use `RETURNING *` instead)

**Transaction note:** The POST and PUT routes use `withTransaction` (from `database.js`) which uses `Pool` + `client.query()`. Inside `withTransaction`, queries use `$1, $2` positional parameter syntax — not tagged templates. This is the only place in the codebase with this syntax.

- [ ] **Step 1: Replace file contents**

```js
const express = require('express');
const { sql, withTransaction } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { computePoints } = require('../utils/points');

const router = express.Router();
router.use(requireAuth);

const WRITE_ALLOWED_STATUSES = new Set(['active', 'trial']);

async function requireActiveSubscription(req, res, next) {
  try {
    const [user] = await sql`SELECT subscription_status FROM users WHERE id = ${req.user.id}`;
    if (!user || !WRITE_ALLOWED_STATUSES.has(user.subscription_status)) {
      return res.status(403).json({ error: 'Active subscription required' });
    }
    next();
  } catch (err) { next(err); }
}

function buildSessionSummary(session, boulderRows) {
  const total_points = boulderRows.reduce((sum, b) => sum + computePoints(b.attempts), 0);
  const completed_count = boulderRows.length;
  const flash_count = boulderRows.filter(b => b.attempts === 1).length;
  return { ...session, total_points, completed_count, flash_count };
}

function validateBoulders(boulders) {
  if (!Array.isArray(boulders)) return 'boulders must be an array';
  for (const b of boulders) {
    if (!Number.isInteger(b.boulder_number) || b.boulder_number < 1 || b.boulder_number > 35)
      return 'boulder_number must be 1-35';
    if (!Number.isInteger(b.attempts) || b.attempts < 1)
      return 'attempts must be a positive integer';
  }
  const nums = boulders.map(b => b.boulder_number);
  if (new Set(nums).size !== nums.length) return 'Duplicate boulder numbers in session';
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const sessions = await sql`
      SELECT * FROM sessions WHERE user_id = ${req.user.id} ORDER BY date DESC, created_at DESC
    `;
    const result = await Promise.all(sessions.map(async s => {
      const boulders = await sql`SELECT * FROM boulders WHERE session_id = ${s.id}`;
      return buildSessionSummary(s, boulders);
    }));
    res.json(result);
  } catch (err) { next(err); }
});

// MUST be before /:id
router.get('/full', async (req, res, next) => {
  try {
    const sessions = await sql`
      SELECT * FROM sessions WHERE user_id = ${req.user.id} ORDER BY date ASC
    `;
    const result = await Promise.all(sessions.map(async s => {
      const boulderRows = await sql`SELECT * FROM boulders WHERE session_id = ${s.id}`;
      const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
      return { ...buildSessionSummary(s, boulderRows), boulders: boulderList };
    }));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireActiveSubscription, async (req, res, next) => {
  try {
    const { date, location, notes, boulders = [] } = req.body;
    if (!date || !location) return res.status(400).json({ error: 'date and location required' });
    const err = validateBoulders(boulders);
    if (err) return res.status(400).json({ error: err });

    // withTransaction uses Pool/client.query() with $1,$2 positional params
    const session = await withTransaction(async (client) => {
      const { rows: [newSession] } = await client.query(
        'INSERT INTO sessions (user_id, date, location, notes) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.id, date, location.trim(), notes?.trim() || null]
      );
      for (const b of boulders) {
        await client.query(
          'INSERT INTO boulders (session_id, boulder_number, attempts) VALUES ($1, $2, $3)',
          [newSession.id, b.boulder_number, b.attempts]
        );
      }
      return newSession;
    });

    const boulderRows = await sql`SELECT * FROM boulders WHERE session_id = ${session.id}`;
    const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
    res.status(201).json({ ...buildSessionSummary(session, boulderRows), boulders: boulderList });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [session] = await sql`
      SELECT * FROM sessions WHERE id = ${req.params.id} AND user_id = ${req.user.id}
    `;
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const boulderRows = await sql`SELECT * FROM boulders WHERE session_id = ${session.id}`;
    const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
    res.json({ ...buildSessionSummary(session, boulderRows), boulders: boulderList });
  } catch (err) { next(err); }
});

router.put('/:id', requireActiveSubscription, async (req, res, next) => {
  try {
    const [session] = await sql`
      SELECT * FROM sessions WHERE id = ${req.params.id} AND user_id = ${req.user.id}
    `;
    if (!session) return res.status(403).json({ error: 'Not found or forbidden' });

    const { date, location, notes, boulders = [] } = req.body;
    if (!date || !location) return res.status(400).json({ error: 'date and location required' });
    const err = validateBoulders(boulders);
    if (err) return res.status(400).json({ error: err });

    // withTransaction uses Pool/client.query() with $1,$2 positional params
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE sessions SET date = $1, location = $2, notes = $3 WHERE id = $4',
        [date, location.trim(), notes?.trim() || null, session.id]
      );
      await client.query('DELETE FROM boulders WHERE session_id = $1', [session.id]);
      for (const b of boulders) {
        await client.query(
          'INSERT INTO boulders (session_id, boulder_number, attempts) VALUES ($1, $2, $3)',
          [session.id, b.boulder_number, b.attempts]
        );
      }
    });

    const [updated] = await sql`SELECT * FROM sessions WHERE id = ${session.id}`;
    const boulderRows = await sql`SELECT * FROM boulders WHERE session_id = ${session.id}`;
    const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
    res.json({ ...buildSessionSummary(updated, boulderRows), boulders: boulderList });
  } catch (err) { next(err); }
});

router.delete('/:id', requireActiveSubscription, async (req, res, next) => {
  try {
    const [session] = await sql`
      SELECT * FROM sessions WHERE id = ${req.params.id} AND user_id = ${req.user.id}
    `;
    if (!session) return res.status(403).json({ error: 'Not found or forbidden' });
    await sql`DELETE FROM sessions WHERE id = ${session.id}`;
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/sessions.js
git commit -m "feat: migrate sessions routes to neon postgres"
```

---

## Task 7: Rewrite `server/routes/admin.js`

**Files:**
- Rewrite: `server/routes/admin.js`

Key changes:
- All handlers become `async`
- `COUNT(*)::int` and `COUNT(s.id)::int` casts for all aggregates

- [ ] **Step 1: Replace file contents**

```js
const express = require('express');
const { sql } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { computePoints } = require('../utils/points');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const VALID_STATUSES = ['active', 'inactive', 'trial'];

router.get('/users', async (req, res, next) => {
  try {
    const users = await sql`
      SELECT u.id, u.email, u.name, u.role, u.subscription_status, u.created_at,
             COUNT(s.id)::int as total_sessions,
             MAX(s.date) as last_session_date
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    res.json(users);
  } catch (err) { next(err); }
});

router.patch('/users/:id/subscription', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const [user] = await sql`SELECT id FROM users WHERE id = ${req.params.id}`;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [updated] = await sql`
      UPDATE users SET subscription_status = ${status} WHERE id = ${req.params.id}
      RETURNING id, email, name, role, subscription_status
    `;
    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/users/:id/sessions', async (req, res, next) => {
  try {
    const sessions = await sql`
      SELECT * FROM sessions WHERE user_id = ${req.params.id} ORDER BY date DESC
    `;
    const result = await Promise.all(sessions.map(async s => {
      const boulders = await sql`SELECT * FROM boulders WHERE session_id = ${s.id}`;
      const total_points = boulders.reduce((sum, b) => sum + computePoints(b.attempts), 0);
      return {
        ...s,
        total_points,
        completed_count: boulders.length,
        flash_count: boulders.filter(b => b.attempts === 1).length,
      };
    }));
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const [user] = await sql`SELECT id FROM users WHERE id = ${req.params.id}`;
    if (!user) return res.status(404).json({ error: 'User not found' });
    await sql`DELETE FROM users WHERE id = ${req.params.id}`;
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const [{ count: totalUsers }] = await sql`SELECT COUNT(*)::int as count FROM users`;
    const [{ count: activeSubscribers }] = await sql`
      SELECT COUNT(*)::int as count FROM users WHERE subscription_status IN ('active', 'trial')
    `;
    const [{ count: totalSessions }] = await sql`SELECT COUNT(*)::int as count FROM sessions`;
    res.json({ totalUsers, activeSubscribers, totalSessions });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: migrate admin routes to neon postgres"
```

---

## Task 8: Create `server/db/seed.pg.js`

**Files:**
- Create: `server/db/seed.pg.js`

- [ ] **Step 1: Write the Postgres seed script**

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = neon(process.env.DATABASE_URL);

const SALT_ROUNDS = 10;
const LOCATIONS = ['The Reach', 'Boulder World', 'VCC', 'Gravity Vault', 'Movement'];

function randomAttempts() {
  const r = Math.random();
  if (r < 0.3) return 1;
  if (r < 0.55) return 2;
  if (r < 0.75) return 3;
  return 4;
}

function generateSession(userId, daysAgo, location) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().slice(0, 10);
  const numCompleted = Math.floor(Math.random() * 11) + 20;
  const boulderNums = Array.from({ length: 35 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, numCompleted);
  return { userId, dateStr, location, boulders: boulderNums.map(n => ({ number: n, attempts: randomAttempts() })) };
}

async function seed() {
  console.log('Seeding database...');

  const existing = await sql`
    SELECT id FROM users WHERE email IN ('admin@climbing.app', 'demo@climbing.app')
  `;
  if (existing.length > 0) {
    console.log('Seed data already exists. Delete it first if you want to re-seed.');
    return;
  }

  const adminHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  const [admin] = await sql`
    INSERT INTO users (email, name, password_hash, role, subscription_status)
    VALUES ('admin@climbing.app', 'Admin', ${adminHash}, 'admin', 'active')
    RETURNING id
  `;
  console.log(`Created admin: admin@climbing.app (id: ${admin.id})`);

  const demoHash = await bcrypt.hash('demo123', SALT_ROUNDS);
  const [demo] = await sql`
    INSERT INTO users (email, name, password_hash, role, subscription_status)
    VALUES ('demo@climbing.app', 'Demo Climber', ${demoHash}, 'user', 'active')
    RETURNING id
  `;
  console.log(`Created demo user: demo@climbing.app (id: ${demo.id})`);

  const sessionDays = [85, 78, 71, 63, 55, 45, 36, 25, 14, 4];
  for (let i = 0; i < sessionDays.length; i++) {
    const location = LOCATIONS[i % LOCATIONS.length];
    const sessionData = generateSession(demo.id, sessionDays[i], location);

    const [session] = await sql`
      INSERT INTO sessions (user_id, date, location)
      VALUES (${demo.id}, ${sessionData.dateStr}, ${location})
      RETURNING id
    `;

    for (const b of sessionData.boulders) {
      await sql`
        INSERT INTO boulders (session_id, boulder_number, attempts)
        VALUES (${session.id}, ${b.number}, ${b.attempts})
      `;
    }

    const pts = sessionData.boulders.reduce((sum, b) =>
      sum + (b.attempts === 1 ? 10 : b.attempts === 2 ? 7 : b.attempts === 3 ? 4 : 1), 0);
    console.log(`  Session ${i + 1}: ${sessionData.dateStr} @ ${location} — ${sessionData.boulders.length} boulders, ${pts} pts`);
  }

  console.log('\nSeed complete!');
  console.log('  admin@climbing.app / admin123');
  console.log('  demo@climbing.app  / demo123');
}

seed().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Update the `seed` script in root `package.json` to point at the new file**

Change `"seed": "node server/db/seed.js"` → `"seed": "node server/db/seed.pg.js"` in `package.json`.

- [ ] **Step 3: Run the seed**

```bash
npm run seed
```

Expected: 10 sessions created and logged, same format as before.

- [ ] **Step 4: Commit**

```bash
git add server/db/seed.pg.js package.json
git commit -m "feat: add postgres seed script"
```

---

## Task 9: Create Vercel config and Function entry point

**Files:**
- Create: `api/index.js`
- Create: `vercel.json`
- Create: `.env.example`

- [ ] **Step 1: Create `api/index.js`**

```js
const app = require('../server/index');
module.exports = app;
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "framework": null,
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

- [ ] **Step 3: Create `.env.example`**

```
# Neon Postgres connection string (use the pooled endpoint)
DATABASE_URL=

# JWT signing secret — use a random string of at least 32 characters
JWT_SECRET=
```

- [ ] **Step 4: Add `.env` to `.gitignore` if not already there**

Check `.gitignore` at the repo root. If `.env` is not listed, add it:
```
.env
```

- [ ] **Step 5: Commit**

```bash
git add api/index.js vercel.json .env.example .gitignore
git commit -m "feat: add vercel function entry and config"
```

---

## Task 10: Deploy to Vercel

- [ ] **Step 1: Set environment variables in Vercel dashboard**

Go to the Vercel project → Settings → Environment Variables. Add:
- `DATABASE_URL` — your Neon pooled connection string (Production + Preview + Development)
- `JWT_SECRET` — your production secret (Production + Preview)

- [ ] **Step 2: Push to trigger deployment**

```bash
git push
```

- [ ] **Step 3: Verify deployment**

1. Open the Vercel deployment URL
2. You should see the login page
3. Log in with `demo@climbing.app` / `demo123`
4. Verify the Dashboard loads with sessions
5. Open the Progress page — charts should render
6. Log out and log in as `admin@climbing.app` / `admin123`
7. Verify the Admin panel loads with user list and stats

- [ ] **Step 4: If the deployment shows "404 NOT_FOUND"**

Check Vercel build logs. Common causes:
- `outputDirectory` mismatch — confirm `client/dist` exists after `npm run build`
- Framework auto-detection override — confirm `"framework": null` is in `vercel.json`
- Build script not running — confirm the root `package.json` `build` script is correct

---

## Task 11: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md` (if deployment instructions are relevant)

- [ ] **Step 1: Update `README.md` setup section**

Replace the `## Quick Start` section to reflect that `DATABASE_URL` is now required:

```markdown
### Prerequisites
- Node.js 18+
- npm 9+
- A [Neon](https://neon.tech) Postgres database (free tier works)

### Setup

```bash
# Install all dependencies
npm install
npm install --prefix server
npm install --prefix client
```

Create a `.env` file at the repo root:
```
DATABASE_URL=<your-neon-pooled-connection-string>
JWT_SECRET=<random-secret-32-chars-minimum>
```

```bash
# Create the database tables
npm run migrate

# Seed with demo data (optional)
npm run seed

# Start development server
npm run dev
```
```

- [ ] **Step 2: Update scripts table in README**

Add `migrate` to the scripts table:

| Command | Description |
|---|---|
| `npm run dev` | Start both client and server in development mode |
| `npm run migrate` | Create database tables on Neon (run once) |
| `npm run seed` | Seed the database with demo users and sessions |
| `npm test --prefix server` | Run server tests |
| `npm test --prefix client` | Run client component tests |

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for neon postgres setup"
```

```bash
git push
```
