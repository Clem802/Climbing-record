# Climbing Boulder Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack multi-user climbing boulder tracker with session logging, progress charts, and admin subscription management.

**Architecture:** Strict monorepo with `/client` (React + Vite) and `/server` (Express + SQLite) siblings. Vite proxies `/api/*` to Express on port 3001 so there are no CORS concerns in dev. Auth is JWT stored in an httpOnly SameSite=Strict cookie; `GET /api/auth/me` hydrates auth state on load.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, React Router 6, Recharts 2, Node.js 20+, Express 4, better-sqlite3, bcrypt, jsonwebtoken, cookie-parser, Jest + Supertest (server tests), Vitest + Testing Library (client tests), concurrently (root dev script).

---

## File Map

### Root
```
package.json                    # concurrently dev script + seed shortcut
.gitignore
README.md
```

### Server
```
server/package.json
server/index.js                 # Express app: mounts routes, starts server, inits DB
server/db/database.js           # Opens/creates SQLite file, runs schema, exports db instance
server/db/seed.js               # Idempotent seed: admin + demo user + 10 sessions
server/middleware/auth.js       # Verifies JWT cookie; attaches req.user
server/middleware/requireAdmin.js  # Rejects non-admin requests
server/routes/auth.js           # POST register/login/logout, GET me
server/routes/sessions.js       # CRUD for sessions + boulder rows
server/routes/admin.js          # User management + stats
server/tests/auth.test.js
server/tests/sessions.test.js
server/tests/admin.test.js
```

### Client
```
client/package.json
client/vite.config.js           # /api proxy to :3001
client/index.html
client/postcss.config.js
client/tailwind.config.js
client/src/main.jsx
client/src/App.jsx              # All routes defined here
client/src/api/auth.js          # fetch wrappers: register, login, logout, me
client/src/api/sessions.js      # fetch wrappers: list, get, create, update, delete
client/src/api/admin.js         # fetch wrappers: users, stats, toggleSub, deleteUser, getUserSessions
client/src/hooks/useAuth.jsx    # AuthContext + useAuth hook
client/src/components/ProtectedRoute.jsx
client/src/components/BoulderCard.jsx
client/src/components/SessionSummaryBar.jsx
client/src/hooks/useToast.jsx   # ToastContext, ToastContainer, and useToast hook (all in one file)
client/src/pages/Login.jsx
client/src/pages/Register.jsx
client/src/pages/Dashboard.jsx
client/src/pages/SessionNew.jsx
client/src/pages/SessionDetail.jsx
client/src/pages/Progress.jsx
client/src/pages/Admin.jsx
client/src/pages/Upgrade.jsx
client/src/components/__tests__/BoulderCard.test.jsx
client/src/components/__tests__/SessionSummaryBar.test.jsx
```

---

## Task 1: Root Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "climbing-record",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "seed": "node server/db/seed.js"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
client/node_modules/
server/node_modules/
server/data/
.env
*.local
dist/
.superpowers/
```

- [ ] **Step 3: Install root deps and verify**

```bash
npm install
```

Expected: `node_modules/concurrently` installed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: root monorepo scaffold"
```

---

## Task 2: Server Foundation

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/db/database.js`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "climbing-record-server",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^9.4.3",
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.0.3",
    "supertest": "^6.3.4"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `server/db/database.js`**

```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'climbing.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    subscription_status TEXT NOT NULL DEFAULT 'trial',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS boulders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    boulder_number INTEGER NOT NULL CHECK (boulder_number BETWEEN 1 AND 35),
    attempts INTEGER NOT NULL CHECK (attempts >= 1)
  );
`);

module.exports = db;
```

- [ ] **Step 3: Create `server/index.js`**

```js
const express = require('express');
const cookieParser = require('cookie-parser');

// Initialize DB (runs schema creation)
require('./db/database');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 4: Install server deps**

```bash
cd server && npm install
```

- [ ] **Step 5: Start server and verify**

```bash
cd server && node index.js
```

Expected: `Server running on port 3001` — no errors.

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: server foundation with DB schema init"
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `server/middleware/auth.js`
- Create: `server/middleware/requireAdmin.js`

- [ ] **Step 1: Create `server/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
```

- [ ] **Step 2: Create `server/middleware/requireAdmin.js`**

```js
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = requireAdmin;
```

- [ ] **Step 3: Commit**

```bash
git add server/middleware/
git commit -m "feat: auth and admin middleware"
```

---

## Task 4: Auth Routes + Tests

**Files:**
- Create: `server/routes/auth.js`
- Create: `server/tests/auth.test.js`

- [ ] **Step 1: Write failing auth tests**

```js
// server/tests/auth.test.js
const request = require('supertest');
const app = require('../index');
const db = require('../db/database');

beforeEach(() => {
  db.exec(`DELETE FROM users`);
});

afterAll(() => {
  db.exec(`DELETE FROM users`);
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com', name: 'Test User', password: 'password123'
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', name: 'A', password: 'password123'
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', name: 'B', password: 'password123'
    });
    expect(res.status).toBe(409);
  });

  it('rejects short password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'short@example.com', name: 'A', password: 'abc'
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@example.com', name: 'Login User', password: 'password123'
    });
  });

  it('returns 200 and sets cookie on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com', password: 'password123'
    });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com', password: 'wrong'
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user when authenticated', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'me@example.com', name: 'Me User', password: 'password123'
    });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'logout@example.com', name: 'Logout', password: 'password123'
    });
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
cd server && npm test -- --testPathPattern=auth
```

Expected: FAIL — routes not implemented yet.

- [ ] **Step 3: Create `server/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: process.env.NODE_ENV === 'production',
};

router.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'All fields required' });
  if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)'
  ).run(email.toLowerCase().trim(), name.trim(), password_hash);

  const user = db.prepare('SELECT id, email, name, role, subscription_status FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, subscription_status: user.subscription_status }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, subscription_status: user.subscription_status }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, subscription_status: user.subscription_status } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, subscription_status FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
```

- [ ] **Step 4: Run tests — confirm they PASS**

```bash
cd server && npm test -- --testPathPattern=auth
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.js server/tests/auth.test.js
git commit -m "feat: auth routes (register, login, logout, me)"
```

---

## Task 5: Sessions Routes + Tests

**Files:**
- Create: `server/routes/sessions.js`
- Create: `server/tests/sessions.test.js`

Helper used throughout: `computePoints(attempts)` — `1→10, 2→7, 3→4, >=4→1`.
Session summary fields (`total_points`, `completed_count`, `flash_count`) are always computed from the boulders rows — never stored.

- [ ] **Step 1: Write failing sessions tests**

```js
// server/tests/sessions.test.js
const request = require('supertest');
const app = require('../index');
const db = require('../db/database');

let agent;
let userId;

beforeEach(async () => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');
  agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({
    email: 'climber@example.com', name: 'Climber', password: 'password123'
  });
  userId = res.body.user.id;
});

afterAll(() => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');
});

describe('POST /api/sessions', () => {
  it('creates a session with boulders and returns summary fields', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01',
      location: 'The Reach',
      boulders: [
        { boulder_number: 1, attempts: 1 },
        { boulder_number: 2, attempts: 2 },
        { boulder_number: 3, attempts: 4 },
      ]
    });
    expect(res.status).toBe(201);
    expect(res.body.total_points).toBe(10 + 7 + 1); // 18
    expect(res.body.completed_count).toBe(3);
    expect(res.body.flash_count).toBe(1);
    expect(res.body.boulders).toHaveLength(3);
  });

  it('allows empty boulder array (zero session)', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    expect(res.status).toBe(201);
    expect(res.body.total_points).toBe(0);
  });

  it('rejects boulder_number out of range', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 36, attempts: 1 }]
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 for inactive user', async () => {
    db.prepare("UPDATE users SET subscription_status = 'inactive' WHERE id = ?").run(userId);
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions', () => {
  it('returns only the logged-in user sessions', async () => {
    await agent.post('/api/sessions').send({ date: '2026-03-01', location: 'Gym', boulders: [] });

    const agent2 = request.agent(app);
    await agent2.post('/api/auth/register').send({
      email: 'other@example.com', name: 'Other', password: 'password123'
    });
    await agent2.post('/api/sessions').send({ date: '2026-03-02', location: 'Gym2', boulders: [] });

    const res = await agent.get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].location).toBe('Gym');
  });
});

describe('PUT /api/sessions/:id', () => {
  it('replaces boulder rows atomically', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 1, attempts: 1 }]
    });
    const sessionId = create.body.id;

    const res = await agent.put(`/api/sessions/${sessionId}`).send({
      date: '2026-03-01', location: 'Gym Updated',
      boulders: [
        { boulder_number: 2, attempts: 2 },
        { boulder_number: 3, attempts: 3 },
      ]
    });
    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Gym Updated');
    expect(res.body.boulders).toHaveLength(2);
    expect(res.body.total_points).toBe(7 + 4); // 11
  });

  it('returns 403 when trying to edit another user session', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/register').send({
      email: 'attacker@example.com', name: 'Attacker', password: 'password123'
    });
    const res = await agent2.put(`/api/sessions/${create.body.id}`).send({
      date: '2026-03-01', location: 'Hacked', boulders: []
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes session and cascades to boulders', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 1, attempts: 1 }]
    });
    const res = await agent.delete(`/api/sessions/${create.body.id}`);
    expect(res.status).toBe(204);
    const boulders = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(create.body.id);
    expect(boulders).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
cd server && npm test -- --testPathPattern=sessions
```

Expected: FAIL — routes not implemented.

- [ ] **Step 3: Create `server/routes/sessions.js`**

```js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function computePoints(attempts) {
  if (attempts === 1) return 10;
  if (attempts === 2) return 7;
  if (attempts === 3) return 4;
  return 1;
}

function requireActiveSubscription(req, res, next) {
  if (req.user.subscription_status === 'inactive') {
    return res.status(403).json({ error: 'Active subscription required' });
  }
  next();
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

router.get('/', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(req.user.id);
  const result = sessions.map(s => {
    const boulders = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(s.id);
    return buildSessionSummary(s, boulders);
  });
  res.json(result);
});

router.post('/', requireActiveSubscription, (req, res) => {
  const { date, location, notes, boulders = [] } = req.body;
  if (!date || !location) return res.status(400).json({ error: 'date and location required' });
  const err = validateBoulders(boulders);
  if (err) return res.status(400).json({ error: err });

  const insertSession = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO sessions (user_id, date, location, notes) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, date, location.trim(), notes?.trim() || null);
    const sessionId = result.lastInsertRowid;
    const insertBoulder = db.prepare('INSERT INTO boulders (session_id, boulder_number, attempts) VALUES (?, ?, ?)');
    for (const b of boulders) insertBoulder.run(sessionId, b.boulder_number, b.attempts);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  });

  const session = insertSession();
  const boulderRows = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(session.id);
  const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
  res.status(201).json({ ...buildSessionSummary(session, boulderRows), boulders: boulderList });
});

router.get('/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const boulderRows = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(session.id);
  const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
  res.json({ ...buildSessionSummary(session, boulderRows), boulders: boulderList });
});

router.put('/:id', requireActiveSubscription, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(403).json({ error: 'Not found or forbidden' });

  const { date, location, notes, boulders = [] } = req.body;
  if (!date || !location) return res.status(400).json({ error: 'date and location required' });
  const err = validateBoulders(boulders);
  if (err) return res.status(400).json({ error: err });

  const updateSession = db.transaction(() => {
    db.prepare('UPDATE sessions SET date = ?, location = ?, notes = ? WHERE id = ?')
      .run(date, location.trim(), notes?.trim() || null, session.id);
    db.prepare('DELETE FROM boulders WHERE session_id = ?').run(session.id);
    const insertBoulder = db.prepare('INSERT INTO boulders (session_id, boulder_number, attempts) VALUES (?, ?, ?)');
    for (const b of boulders) insertBoulder.run(session.id, b.boulder_number, b.attempts);
  });
  updateSession();

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  const boulderRows = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(session.id);
  const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
  res.json({ ...buildSessionSummary(updated, boulderRows), boulders: boulderList });
});

router.delete('/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(403).json({ error: 'Not found or forbidden' });
  db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
  res.status(204).send();
});

module.exports = router;
```

- [ ] **Step 4: Run tests — confirm they PASS**

```bash
cd server && npm test -- --testPathPattern=sessions
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/sessions.js server/tests/sessions.test.js
git commit -m "feat: sessions CRUD routes with points computation"
```

---

## Task 6: Admin Routes + Tests

**Files:**
- Create: `server/routes/admin.js`
- Create: `server/tests/admin.test.js`

- [ ] **Step 1: Write failing admin tests**

```js
// server/tests/admin.test.js
const request = require('supertest');
const app = require('../index');
const db = require('../db/database');

let adminAgent;
let userAgent;
let userId;

beforeEach(async () => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');

  adminAgent = request.agent(app);
  await adminAgent.post('/api/auth/register').send({
    email: 'admin@test.com', name: 'Admin', password: 'password123'
  });
  const adminId = db.prepare("SELECT id FROM users WHERE email = 'admin@test.com'").get().id;
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(adminId);
  // Re-login to get fresh token with admin role
  await adminAgent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });

  userAgent = request.agent(app);
  const res = await userAgent.post('/api/auth/register').send({
    email: 'user@test.com', name: 'User', password: 'password123'
  });
  userId = res.body.user.id;
});

afterAll(() => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');
});

describe('GET /api/admin/users', () => {
  it('returns all users with stats for admin', async () => {
    const res = await adminAgent.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('total_sessions');
  });

  it('returns 403 for regular user', async () => {
    const res = await userAgent.get('/api/admin/users');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/users/:id/subscription', () => {
  it('updates subscription status', async () => {
    const res = await adminAgent.patch(`/api/admin/users/${userId}/subscription`)
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.subscription_status).toBe('inactive');
  });

  it('rejects invalid status', async () => {
    const res = await adminAgent.patch(`/api/admin/users/${userId}/subscription`)
      .send({ status: 'gold' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes user and cascades', async () => {
    await userAgent.post('/api/sessions').send({ date: '2026-03-01', location: 'Gym', boulders: [] });
    const res = await adminAgent.delete(`/api/admin/users/${userId}`);
    expect(res.status).toBe(204);
    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(userId);
    expect(sessions).toHaveLength(0);
  });
});

describe('GET /api/admin/stats', () => {
  it('returns totals', async () => {
    const res = await adminAgent.get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('activeSubscribers');
    expect(res.body).toHaveProperty('totalSessions');
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
cd server && npm test -- --testPathPattern=admin
```

Expected: FAIL.

- [ ] **Step 3: Create `server/routes/admin.js`**

```js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const VALID_STATUSES = ['active', 'inactive', 'trial'];

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.subscription_status, u.created_at,
           COUNT(s.id) as total_sessions,
           MAX(s.date) as last_session_date
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.patch('/users/:id/subscription', (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET subscription_status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare('SELECT id, email, name, role, subscription_status FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.get('/users/:id/sessions', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY date DESC').all(req.params.id);
  const result = sessions.map(s => {
    const boulders = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(s.id);
    const total_points = boulders.reduce((sum, b) => {
      const pts = b.attempts === 1 ? 10 : b.attempts === 2 ? 7 : b.attempts === 3 ? 4 : 1;
      return sum + pts;
    }, 0);
    return { ...s, total_points, completed_count: boulders.length, flash_count: boulders.filter(b => b.attempts === 1).length };
  });
  res.json(result);
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeSubscribers = db.prepare("SELECT COUNT(*) as count FROM users WHERE subscription_status IN ('active', 'trial')").get().count;
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
  res.json({ totalUsers, activeSubscribers, totalSessions });
});

module.exports = router;
```

- [ ] **Step 4: Run all server tests**

```bash
cd server && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/tests/admin.test.js
git commit -m "feat: admin routes (users, stats, subscription management)"
```

---

## Task 7: Client Scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/index.html`
- Create: `client/vite.config.js`
- Create: `client/postcss.config.js`
- Create: `client/tailwind.config.js`
- Create: `client/src/main.jsx`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "climbing-record-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^14.2.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.0",
    "vitest": "^1.3.1"
  }
}
```

- [ ] **Step 2: Create `client/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
});
```

- [ ] **Step 3: Create `client/src/test-setup.js`**

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Create `client/tailwind.config.js`**

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#f97316', dark: '#ea580c' }, // orange
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `client/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Climbing Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `client/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Create `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-950 text-gray-100 min-h-screen;
}
```

- [ ] **Step 9: Install client deps**

```bash
cd client && npm install
```

- [ ] **Step 10: Commit**

```bash
git add client/
git commit -m "feat: client scaffold with Vite + React + Tailwind"
```

---

## Task 8: Auth Context + API + Pages

**Files:**
- Create: `client/src/api/auth.js`
- Create: `client/src/hooks/useAuth.jsx`
- Create: `client/src/components/ProtectedRoute.jsx`
- Create: `client/src/pages/Login.jsx`
- Create: `client/src/pages/Register.jsx`
- Create: `client/src/App.jsx`

- [ ] **Step 1: Create `client/src/api/auth.js`**

```js
const BASE = '/api/auth';

export async function apiRegister(data) {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function apiLogin(data) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function apiLogout() {
  await fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include' });
}

export async function apiMe() {
  const res = await fetch(`${BASE}/me`, { credentials: 'include' });
  if (!res.ok) throw await res.json();
  return res.json();
}
```

- [ ] **Step 2: Create `client/src/hooks/useAuth.jsx`**

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { apiMe, apiLogout } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Create `client/src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function ProtectedRoute({ children, adminOnly = false, requireSubscription = false }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (requireSubscription && user.subscription_status === 'inactive') return <Navigate to="/upgrade" replace />;

  return children;
}
```

- [ ] **Step 4: Create `client/src/pages/Login.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiLogin } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin({ email, password });
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">Climbing Tracker</h1>
        <p className="text-gray-400 text-center mb-8">Sign in to your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 p-3 rounded">{error}</p>}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2 rounded transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-gray-400 mt-4 text-sm">
          No account? <Link to="/register" className="text-brand hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `client/src/pages/Register.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRegister } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Register() {
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const data = await apiRegister(form);
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">Create Account</h1>
        <p className="text-gray-400 text-center mb-8">Start tracking your climbs</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-950 p-3 rounded">{error}</p>}
          {[['Name', 'name', 'text'], ['Email', 'email', 'email'], ['Password', 'password', 'password']].map(([label, field, type]) => (
            <div key={field}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input type={type} value={form[field]} onChange={set(field)} required
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand" />
            </div>
          ))}
          <button type="submit" disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2 rounded transition disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center text-gray-400 mt-4 text-sm">
          Have an account? <Link to="/login" className="text-brand hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `client/src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SessionNew from './pages/SessionNew.jsx';
import SessionDetail from './pages/SessionDetail.jsx';
import Progress from './pages/Progress.jsx';
import Admin from './pages/Admin.jsx';
import Upgrade from './pages/Upgrade.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/sessions/new" element={<ProtectedRoute requireSubscription><SessionNew /></ProtectedRoute>} />
            <Route path="/sessions/:id" element={<ProtectedRoute><SessionDetail /></ProtectedRoute>} />
            <Route path="/progress" element={<ProtectedRoute requireSubscription><Progress /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
            <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/
git commit -m "feat: auth context, login/register pages, protected route"
```

---

## Task 9: Toast System + Upgrade Page

**Files:**
- Create: `client/src/hooks/useToast.jsx`
- Create: `client/src/components/Toast.jsx`
- Create: `client/src/pages/Upgrade.jsx`

- [ ] **Step 1: Create `client/src/hooks/useToast.jsx`**

```jsx
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id}
          className={`px-4 py-3 rounded shadow-lg text-sm font-medium transition-all
            ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
```

- [ ] **Step 2: Create `client/src/pages/Upgrade.jsx`**

```jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Upgrade() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-6">🧗</div>
        <h1 className="text-2xl font-bold mb-3">Account Inactive</h1>
        <p className="text-gray-400 mb-6">
          Your account is inactive. Contact your administrator to reactivate your subscription.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded mb-3 transition">
          Back to Dashboard
        </button>
        <button onClick={logout} className="w-full text-gray-400 hover:text-white text-sm transition">
          Sign out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useToast.jsx client/src/pages/Upgrade.jsx
git commit -m "feat: toast system and upgrade page"
```

---

## Task 10: BoulderCard + SessionSummaryBar Components

**Files:**
- Create: `client/src/components/BoulderCard.jsx`
- Create: `client/src/components/SessionSummaryBar.jsx`
- Create: `client/src/components/__tests__/BoulderCard.test.jsx`
- Create: `client/src/components/__tests__/SessionSummaryBar.test.jsx`

- [ ] **Step 1: Write failing BoulderCard tests**

```jsx
// client/src/components/__tests__/BoulderCard.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import BoulderCard from '../BoulderCard.jsx';

describe('BoulderCard', () => {
  it('renders boulder number', () => {
    render(<BoulderCard number={7} value={null} onChange={() => {}} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('calls onChange with attempt value when button clicked', () => {
    const onChange = vi.fn();
    render(<BoulderCard number={1} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('1'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('deselects when same value clicked again', () => {
    const onChange = vi.fn();
    render(<BoulderCard number={1} value={2} onChange={onChange} />);
    fireEvent.click(screen.getByText('2'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows — as default unselected state', () => {
    render(<BoulderCard number={1} value={null} onChange={() => {}} />);
    const dashBtn = screen.getByText('—');
    expect(dashBtn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
cd client && npm test
```

Expected: FAIL.

- [ ] **Step 3: Create `client/src/components/BoulderCard.jsx`**

```jsx
const ATTEMPT_OPTIONS = [
  { value: 1, label: '1', color: 'bg-green-600 hover:bg-green-500' },
  { value: 2, label: '2', color: 'bg-yellow-500 hover:bg-yellow-400' },
  { value: 3, label: '3', color: 'bg-orange-500 hover:bg-orange-400' },
  { value: 4, label: '4+', color: 'bg-red-600 hover:bg-red-500' },
];

const NULL_COLOR = 'bg-gray-700 hover:bg-gray-600';

export default function BoulderCard({ number, value, onChange }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2 flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold text-gray-400">{number}</span>
      <div className="flex gap-0.5 flex-wrap justify-center">
        {ATTEMPT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={`text-xs font-semibold px-1.5 py-1 rounded transition min-w-[28px]
              ${value === opt.value ? opt.color + ' text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => onChange(null)}
          className={`text-xs font-semibold px-1.5 py-1 rounded transition min-w-[28px]
            ${value === null ? 'bg-gray-600 text-gray-200' : NULL_COLOR + ' text-gray-400'}`}
        >
          —
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write failing SessionSummaryBar tests**

```jsx
// client/src/components/__tests__/SessionSummaryBar.test.jsx
import { render, screen } from '@testing-library/react';
import SessionSummaryBar from '../SessionSummaryBar.jsx';

describe('SessionSummaryBar', () => {
  const boulders = { 1: 1, 2: 2, 3: 3, 4: 4 }; // attempts per boulder

  it('shows total points', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    // 10+7+4+1 = 22
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('shows correct completed count', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    expect(screen.getByText('4 / 35')).toBeInTheDocument();
  });

  it('shows flash count', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    expect(screen.getByText('1')).toBeInTheDocument(); // 1 flash
  });

  it('shows 0 pts for empty boulders', () => {
    render(<SessionSummaryBar boulders={{}} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Create `client/src/components/SessionSummaryBar.jsx`**

`boulders` prop: `{ [boulder_number]: attempts | null }` — null entries are not attempted.

```jsx
function computePoints(attempts) {
  if (attempts === 1) return 10;
  if (attempts === 2) return 7;
  if (attempts === 3) return 4;
  return 1;
}

export default function SessionSummaryBar({ boulders }) {
  const entries = Object.values(boulders).filter(v => v !== null);
  const total_points = entries.reduce((sum, a) => sum + computePoints(a), 0);
  const completed_count = entries.length;
  const flash_count = entries.filter(a => a === 1).length;
  const avg = completed_count > 0 ? (entries.reduce((s, a) => s + a, 0) / completed_count).toFixed(1) : '—';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 px-4 py-3 z-40">
      <div className="max-w-2xl mx-auto flex justify-around">
        <Stat label="Points" value={total_points} accent />
        <Stat label="Completed" value={`${completed_count} / 35`} />
        <Stat label="Flashes" value={flash_count} />
        <Stat label="Avg Attempts" value={avg} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${accent ? 'text-brand' : 'text-white'}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
```

- [ ] **Step 6: Run component tests**

```bash
cd client && npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/
git commit -m "feat: BoulderCard and SessionSummaryBar components"
```

---

## Task 11: Sessions API Wrappers + Dashboard

**Files:**
- Create: `client/src/api/sessions.js`
- Create: `client/src/pages/Dashboard.jsx`

- [ ] **Step 1: Create `client/src/api/sessions.js`**

```js
const BASE = '/api/sessions';

async function request(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) throw await res.json();
  if (res.status === 204) return null;
  return res.json();
}

export const apiGetSessions = () => request(BASE);
export const apiGetSession = (id) => request(`${BASE}/${id}`);
export const apiCreateSession = (data) => request(BASE, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
export const apiUpdateSession = (id, data) => request(`${BASE}/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
export const apiDeleteSession = (id) => request(`${BASE}/${id}`, { method: 'DELETE' });
```

- [ ] **Step 2: Create `client/src/pages/Dashboard.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetSessions } from '../api/sessions.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const canLog = user?.subscription_status !== 'inactive';

  useEffect(() => {
    apiGetSessions()
      .then(setSessions)
      .catch(() => addToast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm">Welcome, {user?.name}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Admin</Link>
          )}
          {canLog && (
            <Link to="/progress" className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Progress</Link>
          )}
          <button onClick={logout} className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Sign out</button>
        </div>
      </div>

      {/* Inactive banner */}
      {!canLog && (
        <div className="mb-6 bg-amber-900/40 border border-amber-700 rounded p-4 flex items-center justify-between">
          <p className="text-amber-300 text-sm">Your subscription is inactive. Contact your admin to reactivate.</p>
        </div>
      )}

      {/* New session button */}
      {canLog && (
        <button
          onClick={() => navigate('/sessions/new')}
          className="w-full mb-6 bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-lg transition text-lg">
          + Log New Session
        </button>
      )}

      {/* Sessions table */}
      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No sessions yet. {canLog ? 'Log your first session!' : ''}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Location</th>
                <th className="pb-2 pr-4 text-right">Score</th>
                <th className="pb-2 pr-4 text-right">Completed</th>
                <th className="pb-2 text-right">Flashes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  className="border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition">
                  <td className="py-3 pr-4">{s.date}</td>
                  <td className="py-3 pr-4 text-gray-300">{s.location}</td>
                  <td className="py-3 pr-4 text-right font-bold text-brand">{s.total_points}</td>
                  <td className="py-3 pr-4 text-right">{s.completed_count} / 35</td>
                  <td className="py-3 text-right">{s.flash_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/sessions.js client/src/pages/Dashboard.jsx
git commit -m "feat: dashboard with session history table"
```

---

## Task 12: SessionNew + SessionDetail Pages

**Files:**
- Create: `client/src/pages/SessionNew.jsx`
- Create: `client/src/pages/SessionDetail.jsx`

Both pages share the same boulder grid pattern. `SessionNew` starts blank; `SessionDetail` loads and pre-populates.

- [ ] **Step 1: Create `client/src/pages/SessionNew.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BoulderCard from '../components/BoulderCard.jsx';
import SessionSummaryBar from '../components/SessionSummaryBar.jsx';
import { apiCreateSession } from '../api/sessions.js';
import { useToast } from '../hooks/useToast.jsx';

// Initialize all 35 boulders to null (not attempted)
function initBoulders() {
  const b = {};
  for (let i = 1; i <= 35; i++) b[i] = null;
  return b;
}

function computePoints(a) { return a === 1 ? 10 : a === 2 ? 7 : a === 3 ? 4 : 1; }

export default function SessionNew() {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), location: '', notes: '' });
  const [boulders, setBoulders] = useState(initBoulders);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const { addToast } = useToast();
  const navigate = useNavigate();

  function setboulder(num, value) {
    setBoulders(b => ({ ...b, [num]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.location.trim()) { addToast('Location is required', 'error'); return; }
    setSaving(true);
    try {
      const boulderPayload = Object.entries(boulders)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ({ boulder_number: Number(k), attempts: v }));
      const data = await apiCreateSession({ ...form, boulders: boulderPayload });
      setSummary(data);
    } catch (err) {
      addToast(err.error || 'Failed to save session', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-sm w-full text-center">
          <h2 className="text-2xl font-bold mb-6">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-700 rounded p-4">
              <div className="text-3xl font-bold text-brand">{summary.total_points}</div>
              <div className="text-sm text-gray-400 mt-1">Total Points</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-3xl font-bold">{summary.completed_count} / 35</div>
              <div className="text-sm text-gray-400 mt-1">Completed</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-3xl font-bold text-green-400">{summary.flash_count}</div>
              <div className="text-sm text-gray-400 mt-1">Flashes</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-3xl font-bold">
                {summary.completed_count > 0
                  ? (summary.boulders.reduce((s, b) => s + b.attempts, 0) / summary.completed_count).toFixed(1)
                  : '—'}
              </div>
              <div className="text-sm text-gray-400 mt-1">Avg Attempts</div>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded transition">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-2xl font-bold">New Session</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Location</label>
            <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. The Reach" required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand resize-none" />
        </div>

        <div className="grid grid-cols-5 gap-1.5 mb-6">
          {Array.from({ length: 35 }, (_, i) => i + 1).map(num => (
            <BoulderCard key={num} number={num} value={boulders[num]} onChange={v => setboulder(num, v)} />
          ))}
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-lg transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Session'}
        </button>
      </form>

      <SessionSummaryBar boulders={boulders} />
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/SessionDetail.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoulderCard from '../components/BoulderCard.jsx';
import SessionSummaryBar from '../components/SessionSummaryBar.jsx';
import { apiGetSession, apiUpdateSession } from '../api/sessions.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';

function initBoulders(boulderRows) {
  const b = {};
  for (let i = 1; i <= 35; i++) b[i] = null;
  for (const row of boulderRows) b[row.boulder_number] = row.attempts;
  return b;
}

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const canEdit = user?.subscription_status !== 'inactive';

  const [form, setForm] = useState({ date: '', location: '', notes: '' });
  const [boulders, setBoulders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGetSession(id)
      .then(data => {
        setForm({ date: data.date, location: data.location, notes: data.notes || '' });
        setBoulders(initBoulders(data.boulders));
      })
      .catch(() => { addToast('Failed to load session', 'error'); navigate('/dashboard'); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const boulderPayload = Object.entries(boulders)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ({ boulder_number: Number(k), attempts: v }));
      await apiUpdateSession(id, { ...form, boulders: boulderPayload });
      addToast('Session saved!');
      navigate('/dashboard');
    } catch (err) {
      addToast(err.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-2xl font-bold">Session Detail</h1>
        {!canEdit && <span className="ml-auto text-xs bg-amber-900/50 text-amber-300 px-2 py-1 rounded">Read Only</span>}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Location</label>
            <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand disabled:opacity-60" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            disabled={!canEdit} rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand resize-none disabled:opacity-60" />
        </div>

        <div className="grid grid-cols-5 gap-1.5 mb-6">
          {Array.from({ length: 35 }, (_, i) => i + 1).map(num => (
            <BoulderCard key={num} number={num} value={boulders[num]}
              onChange={canEdit ? v => setBoulders(b => ({ ...b, [num]: v })) : () => {}} />
          ))}
        </div>

        {canEdit && (
          <button type="submit" disabled={saving}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-lg transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </form>

      <SessionSummaryBar boulders={boulders} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SessionNew.jsx client/src/pages/SessionDetail.jsx
git commit -m "feat: session logging and editing pages"
```

---

## Task 13: Progress Charts Page

**Files:**
- Create: `client/src/pages/Progress.jsx`

Charts 1–3 use session summary data; charts 4–5 require per-boulder detail. For v1, fetch all sessions with boulders by calling `GET /api/sessions/:id` for each session. With only 10–50 sessions this is acceptable.

Note: Add `GET /api/sessions/full` endpoint to server that returns all sessions with boulder detail in one call, to avoid N+1 fetches. Add this to `server/routes/sessions.js`.

- [ ] **Step 1: Add `/api/sessions/full` endpoint to `server/routes/sessions.js`**

Add before `router.get('/:id', ...)`:

```js
router.get('/full', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY date ASC').all(req.user.id);
  const result = sessions.map(s => {
    const boulderRows = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(s.id);
    const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
    return { ...buildSessionSummary(s, boulderRows), boulders: boulderList };
  });
  res.json(result);
});
```

Also add to `client/src/api/sessions.js`:
```js
export const apiGetSessionsFull = () => request(`${BASE}/full`);
```

- [ ] **Step 2: Create `client/src/pages/Progress.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { apiGetSessionsFull } from '../api/sessions.js';
import { useToast } from '../hooks/useToast.jsx';

const RANGES = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: null },
];

function filterByRange(sessions, days) {
  if (!days) return sessions;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return sessions.filter(s => new Date(s.date) >= cutoff);
}

export default function Progress() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(90);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    apiGetSessionsFull()
      .then(setSessions)
      .catch(() => addToast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterByRange(sessions, range);

  const chartData = filtered.map(s => {
    const avgAttempts = s.completed_count > 0
      ? (s.boulders.reduce((sum, b) => sum + b.attempts, 0) / s.completed_count).toFixed(2)
      : 0;
    const pts10 = s.boulders.filter(b => b.attempts === 1).length;
    const pts7 = s.boulders.filter(b => b.attempts === 2).length;
    const pts4 = s.boulders.filter(b => b.attempts === 3).length;
    const pts1 = s.boulders.filter(b => b.attempts >= 4).length;
    return {
      date: s.date.slice(5), // MM-DD
      score: s.total_points,
      completion: Math.round((s.completed_count / 35) * 100),
      flashes: s.flash_count,
      avgAttempts: Number(avgAttempts),
      pts10, pts7, pts4, pts1,
    };
  });

  const chartProps = {
    data: chartData,
    margin: { top: 5, right: 10, left: -10, bottom: 5 },
  };

  const axisProps = { stroke: '#6b7280', tick: { fill: '#9ca3af', fontSize: 11 } };
  const gridProps = { strokeDasharray: '3 3', stroke: '#374151' };
  const tooltipProps = { contentStyle: { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' } };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold">Progress</h1>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r.days)}
              className={`text-sm px-3 py-1.5 rounded transition ${range === r.days ? 'bg-brand text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No sessions in this range.</p>
      ) : (
        <div className="space-y-8">
          <ChartCard title="Score Over Time">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 350]} />
                <Tooltip {...tooltipProps} />
                <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Points" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Completion Rate (%)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} unit="%" />
                <Tooltip {...tooltipProps} formatter={v => `${v}%`} />
                <Line type="monotone" dataKey="completion" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Completion" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Flash Rate">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="flashes" fill="#4ade80" name="Flashes" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Average Attempts per Completed Boulder">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[1, 4]} />
                <Tooltip {...tooltipProps} />
                <Line type="monotone" dataKey="avgAttempts" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} name="Avg Attempts" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Points Breakdown per Session">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                <Bar dataKey="pts10" stackId="a" fill="#4ade80" name="10pts (flash)" />
                <Bar dataKey="pts7" stackId="a" fill="#facc15" name="7pts" />
                <Bar dataKey="pts4" stackId="a" fill="#f97316" name="4pts" />
                <Bar dataKey="pts1" stackId="a" fill="#ef4444" name="1pt" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Progress.jsx client/src/api/sessions.js server/routes/sessions.js
git commit -m "feat: progress charts with 5 recharts visualizations"
```

---

## Task 14: Admin Page

**Files:**
- Create: `client/src/api/admin.js`
- Create: `client/src/pages/Admin.jsx`

- [ ] **Step 1: Create `client/src/api/admin.js`**

```js
const BASE = '/api/admin';

async function request(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) throw await res.json();
  if (res.status === 204) return null;
  return res.json();
}

export const apiAdminGetUsers = () => request(`${BASE}/users`);
export const apiAdminGetStats = () => request(`${BASE}/stats`);
export const apiAdminToggleSub = (id, status) => request(`${BASE}/users/${id}/subscription`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
});
export const apiAdminGetUserSessions = (id) => request(`${BASE}/users/${id}/sessions`);
export const apiAdminDeleteUser = (id) => request(`${BASE}/users/${id}`, { method: 'DELETE' });
```

- [ ] **Step 2: Create `client/src/pages/Admin.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiAdminGetUsers, apiAdminGetStats,
  apiAdminToggleSub, apiAdminGetUserSessions, apiAdminDeleteUser
} from '../api/admin.js';
import { useToast } from '../hooks/useToast.jsx';

const STATUS_CYCLE = { active: 'inactive', inactive: 'trial', trial: 'active' };
const STATUS_COLORS = {
  active: 'bg-green-900/50 text-green-300',
  trial: 'bg-blue-900/50 text-blue-300',
  inactive: 'bg-red-900/50 text-red-300',
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSessions, setUserSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([apiAdminGetUsers(), apiAdminGetStats()])
      .then(([u, s]) => { setUsers(u); setStats(s); })
      .catch(() => addToast('Failed to load admin data', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function toggleSub(user) {
    const next = STATUS_CYCLE[user.subscription_status];
    try {
      const updated = await apiAdminToggleSub(user.id, next);
      setUsers(u => u.map(x => x.id === user.id ? { ...x, subscription_status: updated.subscription_status } : x));
      addToast(`${user.name} set to ${next}`);
    } catch { addToast('Failed to update subscription', 'error'); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      await apiAdminDeleteUser(user.id);
      setUsers(u => u.filter(x => x.id !== user.id));
      if (selectedUser?.id === user.id) setSelectedUser(null);
      addToast(`${user.name} deleted`);
    } catch { addToast('Failed to delete user', 'error'); }
  }

  async function viewSessions(user) {
    setSelectedUser(user);
    try {
      const s = await apiAdminGetUserSessions(user.id);
      setUserSessions(s);
    } catch { addToast('Failed to load sessions', 'error'); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            ['Total Users', stats.totalUsers],
            ['Active Subscribers', stats.activeSubscribers],
            ['Total Sessions', stats.totalSessions],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-brand">{value}</div>
              <div className="text-sm text-gray-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className={`grid gap-6 ${selectedUser ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Users table */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Users</h2>
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSub(u)}
                        className={`text-xs px-2 py-1 rounded font-medium transition hover:opacity-80 ${STATUS_COLORS[u.subscription_status]}`}>
                        {u.subscription_status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{u.total_sessions}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => viewSessions(u)} className="text-xs text-blue-400 hover:underline mr-3">Sessions</button>
                      <button onClick={() => deleteUser(u)} className="text-xs text-red-400 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User sessions panel */}
        {selectedUser && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{selectedUser.name}'s Sessions</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              {userSessions.length === 0 ? (
                <p className="text-gray-400 text-sm p-4">No sessions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userSessions.map(s => (
                      <tr key={s.id} className="border-b border-gray-700">
                        <td className="px-4 py-2">{s.date}</td>
                        <td className="px-4 py-2 text-gray-300">{s.location}</td>
                        <td className="px-4 py-2 text-right font-bold text-brand">{s.total_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/admin.js client/src/pages/Admin.jsx
git commit -m "feat: admin panel with user management and stats"
```

---

## Task 15: Seed Script + README

**Files:**
- Create: `server/db/seed.js`
- Create: `README.md`

- [ ] **Step 1: Create `server/db/seed.js`**

```js
const bcrypt = require('bcrypt');
const db = require('./database');

const SALT_ROUNDS = 10;

const LOCATIONS = ['The Reach', 'Boulder World', 'VCC', 'Gravity Vault', 'Movement'];

function randomAttempts() {
  const r = Math.random();
  if (r < 0.3) return 1;  // 30% flash
  if (r < 0.55) return 2; // 25% two attempts
  if (r < 0.75) return 3; // 20% three attempts
  return 4;               // 25% four+
}

function generateSession(userId, daysAgo, location) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().slice(0, 10);

  // Generate 20-30 completed boulders out of 35
  const numCompleted = Math.floor(Math.random() * 11) + 20;
  const boulderNums = Array.from({ length: 35 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, numCompleted);

  return { userId, dateStr, location, boulders: boulderNums.map(n => ({ number: n, attempts: randomAttempts() })) };
}

async function seed() {
  console.log('Seeding database...');

  // Check if already seeded
  const existing = db.prepare("SELECT id FROM users WHERE email IN ('admin@climbing.app', 'demo@climbing.app')").all();
  if (existing.length > 0) {
    console.log('Seed data already exists. Skipping.');
    return;
  }

  // Create admin
  const adminHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  const adminResult = db.prepare(
    "INSERT INTO users (email, name, password_hash, role, subscription_status) VALUES (?, ?, ?, 'admin', 'active')"
  ).run('admin@climbing.app', 'Admin', adminHash);
  console.log(`Created admin: admin@climbing.app (id: ${adminResult.lastInsertRowid})`);

  // Create demo user
  const demoHash = await bcrypt.hash('demo123', SALT_ROUNDS);
  const demoResult = db.prepare(
    "INSERT INTO users (email, name, password_hash, role, subscription_status) VALUES (?, ?, ?, 'user', 'active')"
  ).run('demo@climbing.app', 'Demo Climber', demoHash);
  const demoId = demoResult.lastInsertRowid;
  console.log(`Created demo user: demo@climbing.app (id: ${demoId})`);

  // Generate 10 sessions spread over last 90 days
  const sessionDays = [85, 78, 71, 63, 55, 45, 36, 25, 14, 4];
  const insertSession = db.prepare('INSERT INTO sessions (user_id, date, location) VALUES (?, ?, ?)');
  const insertBoulder = db.prepare('INSERT INTO boulders (session_id, boulder_number, attempts) VALUES (?, ?, ?)');

  for (let i = 0; i < sessionDays.length; i++) {
    const location = LOCATIONS[i % LOCATIONS.length];
    const sessionData = generateSession(demoId, sessionDays[i], location);
    const sResult = insertSession.run(demoId, sessionData.dateStr, location);
    const sessionId = sResult.lastInsertRowid;
    for (const b of sessionData.boulders) {
      insertBoulder.run(sessionId, b.number, b.attempts);
    }
    const pts = sessionData.boulders.reduce((sum, b) => {
      return sum + (b.attempts === 1 ? 10 : b.attempts === 2 ? 7 : b.attempts === 3 ? 4 : 1);
    }, 0);
    console.log(`  Session ${i + 1}: ${sessionData.dateStr} @ ${location} — ${sessionData.boulders.length} boulders, ${pts} pts`);
  }

  console.log('\nSeed complete!');
  console.log('  admin@climbing.app / admin123');
  console.log('  demo@climbing.app  / demo123');
}

seed().catch(console.error);
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Climbing Boulder Tracker

A full-stack web app for tracking indoor climbing boulder problems. Log sessions, earn points, and visualize your progress.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
# Install root dependencies
npm install

# Install server and client dependencies
npm install --prefix server
npm install --prefix client

# Seed the database with demo data
npm run seed
```

### Development

```bash
npm run dev
```

Opens:
- Client: http://localhost:5173
- Server: http://localhost:3001

### Demo Accounts

| Email | Password | Role |
|---|---|---|
| admin@climbing.app | admin123 | Admin |
| demo@climbing.app | demo123 | User |

## Scoring

| Attempts | Points |
|---|---|
| 1 (flash) | 10 |
| 2 | 7 |
| 3 | 4 |
| 4+ | 1 |

Max score per session: **350 points** (35 flashes)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both client and server in development mode |
| `npm run seed` | Seed the database with demo users and sessions |
| `npm test --prefix server` | Run server tests |
| `npm test --prefix client` | Run client component tests |
```

- [ ] **Step 3: Run seed and verify**

```bash
npm run seed
```

Expected output shows 2 users created and 10 sessions with dates, locations, and scores.

- [ ] **Step 4: Start both servers and verify end-to-end**

```bash
npm run dev
```

Open http://localhost:5173 and:
1. Log in with `demo@climbing.app` / `demo123` — see dashboard with 10 sessions
2. Log in with `admin@climbing.app` / `admin123` — see admin panel with 2 users
3. Visit `/progress` — see 5 populated charts
4. Create a new session — verify summary modal appears on submit

- [ ] **Step 5: Commit**

```bash
git add server/db/seed.js README.md
git commit -m "feat: seed script and README"
```

---

## Final Verification

- [ ] All server tests pass: `npm test --prefix server`
- [ ] All client tests pass: `npm test --prefix client`
- [ ] Seed runs cleanly (idempotent — run twice, same result)
- [ ] `npm run dev` starts both servers with no errors
- [ ] Login/register flow works in browser
- [ ] Session logging and editing works
- [ ] Progress charts display with seed data
- [ ] Admin panel shows users, stats, and session history
- [ ] Inactive user sees upgrade prompt on gated routes
- [ ] Mobile view: boulder grid is usable on narrow viewport
