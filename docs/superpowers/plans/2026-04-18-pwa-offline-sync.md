# PWA + Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the climbing boulder tracker into an installable PWA with full offline-first session management, a persistent sync queue, and conflict resolution UI.

**Architecture:** `vite-plugin-pwa` generates the service worker (Workbox); Workbox's NetworkFirst strategy caches `/api/*` responses for transparent offline reads; a custom IndexedDB queue (via `idb`) stores pending CREATE/UPDATE/DELETE session actions that are replayed on reconnect; conflicts (server newer than queued change) are shown in a modal for user resolution.

**Tech Stack:** `vite-plugin-pwa`, `workbox-window`, `idb`, React context, IndexedDB, Vite, Neon Postgres, Vercel Functions

---

## File Map

**New files:**
- `client/src/lib/db.js` — opens IndexedDB `boulder-sync` DB with `queue` + `sessions-cache` stores
- `client/src/hooks/useOnlineStatus.js` — returns `boolean` from `navigator.onLine` + events
- `client/src/hooks/useOfflineQueue.jsx` — context + provider + hook; wraps all session API calls; manages queue drain and conflict detection
- `client/src/components/OfflineBanner.jsx` — amber top banner when offline
- `client/src/components/SyncStatus.jsx` — pending count badge in nav
- `client/src/components/InstallPrompt.jsx` — bottom sheet; handles `beforeinstallprompt` + Safari fallback
- `client/src/components/ConflictResolver.jsx` — modal; blocks UI until all conflicts resolved

**Modified files:**
- `server/db/migrate.js` — add `updated_at TIMESTAMPTZ DEFAULT NOW()` to sessions
- `server/routes/sessions.js` — include `updated_at` in all session responses; touch `updated_at` on UPDATE
- `client/package.json` — add `idb` dep + `vite-plugin-pwa` devDep
- `client/vite.config.js` — add `VitePWA` plugin
- `client/src/App.jsx` — wrap with `OfflineQueueProvider`; add `<OfflineBanner>`, `<InstallPrompt>`, `<ConflictResolver>`
- `client/src/pages/Dashboard.jsx` — use `useOfflineQueue().getSessions()` + show unsynced badge
- `client/src/pages/SessionNew.jsx` — use `useOfflineQueue().createSession()` instead of direct API call
- `client/src/pages/SessionDetail.jsx` — use `useOfflineQueue().updateSession()` / `deleteSession()`

---

## Task 1: Add `updated_at` to sessions (server)

**Files:**
- Modify: `server/db/migrate.js`
- Modify: `server/routes/sessions.js`

- [ ] **Step 1: Add `updated_at` column to migration**

Open `server/db/migrate.js`. The sessions CREATE TABLE currently ends with `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Add the column and an ALTER for existing tables:

```js
// Replace the sessions table creation line with:
await sql`CREATE TABLE IF NOT EXISTS sessions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, location TEXT NOT NULL, notes TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
// Add after all CREATE TABLE statements:
await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
```

- [ ] **Step 2: Touch `updated_at` on PUT in sessions route**

In `server/routes/sessions.js`, find the `router.put('/:id', ...)` handler. Inside `withTransaction`, replace:
```js
await client.query(
  'UPDATE sessions SET date = $1, location = $2, notes = $3 WHERE id = $4',
  [date, location.trim(), notes?.trim() || null, session.id]
);
```
with:
```js
await client.query(
  'UPDATE sessions SET date = $1, location = $2, notes = $3, updated_at = NOW() WHERE id = $4',
  [date, location.trim(), notes?.trim() || null, session.id]
);
```

- [ ] **Step 3: Run migration**

```cmd
node server/db/migrate.js
```
Expected: `Migrations complete.` with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/db/migrate.js server/routes/sessions.js
git commit -m "feat: add updated_at to sessions for conflict detection"
```

---

## Task 2: Install client PWA dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install dependencies**

```cmd
npm install --prefix client idb
npm install --prefix client --save-dev vite-plugin-pwa
```

- [ ] **Step 2: Verify packages appear in `client/package.json`**

`dependencies` should contain `"idb"` and `devDependencies` should contain `"vite-plugin-pwa"`.

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add idb and vite-plugin-pwa dependencies"
```

---

## Task 3: Create PWA icons

**Files:**
- Create: `client/public/icons/icon-192.png`
- Create: `client/public/icons/icon-512.png`

- [ ] **Step 1: Create icon generation script**

Create `scripts/generate-icons.mjs`:

```js
// Run with: node scripts/generate-icons.mjs
// Requires: npm install -g sharp-cli  OR  node >= 18 with canvas
// Alternatively, use https://realfavicongenerator.net with the brand colour #cd2927
// and place the output as client/public/icons/icon-192.png and icon-512.png

// Quick approach using a data URI encoded minimal red PNG:
import { writeFileSync, mkdirSync } from 'fs';
import { createCanvas } from 'canvas';

mkdirSync('client/public/icons', { recursive: true });

for (const size of [192, 512]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#cd2927';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();
  // Text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧗', size / 2, size / 2);
  writeFileSync(`client/public/icons/icon-${size}.png`, canvas.toBuffer('image/png'));
  console.log(`Created icon-${size}.png`);
}
```

- [ ] **Step 2: Generate icons**

If `canvas` npm package is available:
```cmd
npm install canvas --save-dev
node scripts/generate-icons.mjs
```

If `canvas` is not available (common on Windows without build tools), use an online generator:
- Go to https://realfavicongenerator.net
- Use colour `#cd2927`, generate icons
- Download and place `android-chrome-192x192.png` → `client/public/icons/icon-192.png`
- Place `android-chrome-512x512.png` → `client/public/icons/icon-512.png`

- [ ] **Step 3: Verify files exist**

```bash
ls client/public/icons/
```
Expected: `icon-192.png  icon-512.png`

- [ ] **Step 4: Commit**

```bash
git add client/public/icons/
git commit -m "feat: add PWA app icons"
```

---

## Task 4: Configure vite-plugin-pwa

**Files:**
- Modify: `client/vite.config.js`

- [ ] **Step 1: Add VitePWA plugin**

Replace the entire content of `client/vite.config.js` with:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Boulder Tracker',
        short_name: 'Boulder',
        description: 'Track your bouldering sessions with Spider Climbing',
        theme_color: '#cd2927',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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

- [ ] **Step 2: Verify build works**

```cmd
npm run build --prefix client
```
Expected: Build succeeds; `client/dist/sw.js` and `client/dist/manifest.webmanifest` are generated.

- [ ] **Step 3: Commit**

```bash
git add client/vite.config.js
git commit -m "feat: configure vite-plugin-pwa with workbox NetworkFirst for API"
```

---

## Task 5: IndexedDB helper

**Files:**
- Create: `client/src/lib/db.js`

- [ ] **Step 1: Create the DB helper**

Create `client/src/lib/db.js`:

```js
import { openDB } from 'idb';

const DB_NAME = 'boulder-sync';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
          store.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('sessions-cache')) {
          db.createObjectStore('sessions-cache', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/db.js
git commit -m "feat: add IndexedDB helper for offline queue"
```

---

## Task 6: `useOnlineStatus` hook

**Files:**
- Create: `client/src/hooks/useOnlineStatus.js`

- [ ] **Step 1: Create the hook**

Create `client/src/hooks/useOnlineStatus.js`:

```js
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useOnlineStatus.js
git commit -m "feat: add useOnlineStatus hook"
```

---

## Task 7: `useOfflineQueue` context and hook

This is the core of the feature. It wraps all session API calls and manages the IndexedDB queue.

**Files:**
- Create: `client/src/hooks/useOfflineQueue.jsx`

- [ ] **Step 1: Create the context and provider**

Create `client/src/hooks/useOfflineQueue.jsx`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getDB } from '../lib/db.js';
import { useOnlineStatus } from './useOnlineStatus.js';
import {
  apiGetSessions,
  apiGetSession,
  apiCreateSession,
  apiUpdateSession,
  apiDeleteSession,
} from '../api/sessions.js';

const OfflineQueueContext = createContext(null);

function generateId() {
  return crypto.randomUUID();
}

export function OfflineQueueProvider({ children }) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState([]);
  const [errors, setErrors] = useState([]);
  const syncingRef = useRef(false);

  // Refresh counts from IDB
  const refreshCounts = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('queue');
    setPendingCount(all.filter(e => e.status === 'pending').length);
    setConflicts(all.filter(e => e.status === 'conflict'));
    setErrors(all.filter(e => e.status === 'error'));
  }, []);

  // Drain the queue (oldest-first)
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const db = await getDB();
      const allEntries = await db.getAllFromIndex('queue', 'by-timestamp');
      const pending = allEntries.filter(e => e.status === 'pending');

      for (const entry of pending) {
        try {
          if (entry.type === 'CREATE_SESSION') {
            const result = await apiCreateSession(entry.payload.data);
            // Swap temp entry for real one in sessions-cache
            await db.delete('sessions-cache', entry.payload.tempId);
            await db.put('sessions-cache', { ...result, id: String(result.id) });
            await db.delete('queue', entry.id);

          } else if (entry.type === 'UPDATE_SESSION') {
            // Conflict check: compare server updated_at vs our timestamp
            let serverSession;
            try {
              serverSession = await apiGetSession(entry.payload.id);
            } catch (err) {
              if (err.status === 404 || err.error === 'Session not found') {
                // Session deleted on server — mark as error
                await db.put('queue', { ...entry, status: 'error', errorMsg: 'Session no longer exists on server' });
                continue;
              }
              throw err;
            }
            const serverTime = new Date(serverSession.updated_at).getTime();
            if (serverTime > entry.timestamp) {
              // Conflict: server is newer
              await db.put('queue', { ...entry, status: 'conflict', serverVersion: serverSession });
            } else {
              // Safe to update
              const result = await apiUpdateSession(entry.payload.id, entry.payload.data);
              await db.put('sessions-cache', { ...result, id: String(result.id) });
              await db.delete('queue', entry.id);
            }

          } else if (entry.type === 'DELETE_SESSION') {
            try {
              await apiDeleteSession(entry.payload.id);
            } catch (err) {
              // 404 means already deleted — treat as success
              if (err.status !== 404 && err.error !== 'Session not found' && err.error !== 'Not found or forbidden') {
                throw err;
              }
            }
            await db.delete('sessions-cache', String(entry.payload.id));
            await db.delete('queue', entry.id);
          }
        } catch (err) {
          // 4xx = permanent error; network error = leave pending for retry
          const status = err.status || 0;
          if (status >= 400 && status < 500) {
            await db.put('queue', { ...entry, status: 'error', errorMsg: err.error || 'Request failed' });
          }
          // Leave pending for other errors (network timeout etc.)
        }
      }
    } finally {
      syncingRef.current = false;
      await refreshCounts();
    }
  }, [refreshCounts]);

  // Trigger sync when coming back online
  useEffect(() => {
    if (isOnline) syncNow();
  }, [isOnline, syncNow]);

  // Refresh counts on mount
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // --- Session CRUD ---

  const getSessions = useCallback(async () => {
    const db = await getDB();
    let sessions = [];

    try {
      sessions = await apiGetSessions();
      // Update sessions-cache with fresh data (keyed by string id)
      const tx = db.transaction('sessions-cache', 'readwrite');
      // Clear existing real (non-temp) entries before re-populating
      const existing = await tx.store.getAll();
      for (const s of existing) {
        if (!String(s.id).startsWith('temp-')) await tx.store.delete(s.id);
      }
      for (const s of sessions) await tx.store.put({ ...s, id: String(s.id) });
      await tx.done;
    } catch {
      // Offline with no SW cache — fall back to IDB
      const cached = await db.getAll('sessions-cache');
      sessions = cached.filter(s => !String(s.id).startsWith('temp-'));
    }

    // Merge queue
    const queue = await db.getAll('queue');
    const deleteIds = new Set(
      queue.filter(e => e.type === 'DELETE_SESSION').map(e => String(e.payload.id))
    );
    const updateMap = new Map(
      queue.filter(e => e.type === 'UPDATE_SESSION').map(e => [String(e.payload.id), e.payload.data])
    );
    const creates = queue
      .filter(e => e.type === 'CREATE_SESSION')
      .map(e => ({ ...e.payload.optimistic, unsynced: true }));

    const merged = sessions
      .filter(s => !deleteIds.has(String(s.id)))
      .map(s => updateMap.has(String(s.id))
        ? { ...s, ...updateMap.get(String(s.id)), unsynced: true }
        : s
      );

    return [...creates, ...merged];
  }, []);

  const getSession = useCallback(async (id) => {
    const db = await getDB();
    try {
      return await apiGetSession(id);
    } catch {
      return db.get('sessions-cache', String(id));
    }
  }, []);

  const createSession = useCallback(async (data) => {
    if (navigator.onLine) {
      const result = await apiCreateSession(data);
      // Cache the result
      const db = await getDB();
      await db.put('sessions-cache', { ...result, id: String(result.id) });
      return result;
    }
    // Offline: queue it
    const tempId = `temp-${generateId()}`;
    const optimistic = {
      id: tempId,
      ...data,
      total_points: (data.boulders || []).reduce((sum, b) => {
        const pts = [10, 7, 4, 1];
        return sum + (pts[Math.min(b.attempts - 1, 3)] ?? 1);
      }, 0),
      completed_count: (data.boulders || []).length,
      flash_count: (data.boulders || []).filter(b => b.attempts === 1).length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const db = await getDB();
    await db.put('sessions-cache', optimistic);
    await db.put('queue', {
      id: generateId(),
      type: 'CREATE_SESSION',
      payload: { tempId, data, optimistic },
      timestamp: Date.now(),
      status: 'pending',
    });
    await refreshCounts();
    return optimistic;
  }, [refreshCounts]);

  const updateSession = useCallback(async (id, data) => {
    if (navigator.onLine) {
      const result = await apiUpdateSession(id, data);
      const db = await getDB();
      await db.put('sessions-cache', { ...result, id: String(result.id) });
      return result;
    }
    // Offline: queue it
    const db = await getDB();
    // Remove any existing pending UPDATE for the same session (last write wins for queued updates)
    const existing = await db.getAll('queue');
    for (const e of existing) {
      if (e.type === 'UPDATE_SESSION' && String(e.payload.id) === String(id) && e.status === 'pending') {
        await db.delete('queue', e.id);
      }
    }
    await db.put('queue', {
      id: generateId(),
      type: 'UPDATE_SESSION',
      payload: { id: String(id), data },
      timestamp: Date.now(),
      status: 'pending',
    });
    // Update sessions-cache optimistically
    const cached = await db.get('sessions-cache', String(id));
    if (cached) await db.put('sessions-cache', { ...cached, ...data, unsynced: true });
    await refreshCounts();
    return { ...data, id };
  }, [refreshCounts]);

  const deleteSession = useCallback(async (id) => {
    const db = await getDB();

    // Coalesce: if there's a pending CREATE for this temp ID, drop both
    const queue = await db.getAll('queue');
    const createEntry = queue.find(e => e.type === 'CREATE_SESSION' && e.payload.tempId === String(id));
    if (createEntry) {
      await db.delete('queue', createEntry.id);
      await db.delete('sessions-cache', String(id));
      await refreshCounts();
      return;
    }

    if (navigator.onLine) {
      await apiDeleteSession(id);
      await db.delete('sessions-cache', String(id));
      return;
    }
    // Offline: queue it
    await db.put('queue', {
      id: generateId(),
      type: 'DELETE_SESSION',
      payload: { id: String(id) },
      timestamp: Date.now(),
      status: 'pending',
    });
    await db.delete('sessions-cache', String(id));
    await refreshCounts();
  }, [refreshCounts]);

  // --- Conflict resolution ---

  const resolveConflict = useCallback(async (entryId, choice) => {
    // choice: 'mine' | 'server'
    const db = await getDB();
    const entry = await db.get('queue', entryId);
    if (!entry) return;

    if (choice === 'mine') {
      // Re-queue as pending with current timestamp
      await db.put('queue', { ...entry, status: 'pending', timestamp: Date.now(), serverVersion: undefined });
      // Sync immediately
      await syncNow();
    } else {
      // Keep server version — discard local change
      if (entry.serverVersion) {
        await db.put('sessions-cache', { ...entry.serverVersion, id: String(entry.serverVersion.id) });
      }
      await db.delete('queue', entryId);
    }
    await refreshCounts();
  }, [syncNow, refreshCounts]);

  const discardError = useCallback(async (entryId) => {
    const db = await getDB();
    await db.delete('queue', entryId);
    await refreshCounts();
  }, [refreshCounts]);

  return (
    <OfflineQueueContext.Provider value={{
      getSessions,
      getSession,
      createSession,
      updateSession,
      deleteSession,
      pendingCount,
      conflicts,
      errors,
      resolveConflict,
      discardError,
      syncNow,
    }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error('useOfflineQueue must be used inside OfflineQueueProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useOfflineQueue.jsx client/src/lib/db.js client/src/hooks/useOnlineStatus.js
git commit -m "feat: add useOfflineQueue context with IndexedDB sync queue"
```

---

## Task 8: `OfflineBanner` component

**Files:**
- Create: `client/src/components/OfflineBanner.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/OfflineBanner.jsx`:

```jsx
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
      <span className="text-sm font-medium text-amber-800">
        You're offline — changes will sync when you reconnect
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/OfflineBanner.jsx
git commit -m "feat: add OfflineBanner component"
```

---

## Task 9: `SyncStatus` component

**Files:**
- Create: `client/src/components/SyncStatus.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/SyncStatus.jsx`:

```jsx
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';

export default function SyncStatus() {
  const { pendingCount, syncNow } = useOfflineQueue();
  if (pendingCount === 0) return null;
  return (
    <button
      onClick={syncNow}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition"
      title="Click to sync now"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {pendingCount} unsynced
    </button>
  );
}
```

- [ ] **Step 2: Add SyncStatus to Dashboard nav**

In `client/src/pages/Dashboard.jsx`, add the import at the top:

```jsx
import SyncStatus from '../components/SyncStatus.jsx';
```

Inside the `<header>` nav `<div className="flex gap-2">`, add `<SyncStatus />` as the first child:

```jsx
<div className="flex gap-2 items-center">
  <SyncStatus />
  {user?.role === 'admin' && (
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SyncStatus.jsx client/src/pages/Dashboard.jsx
git commit -m "feat: add SyncStatus nav indicator"
```

---

## Task 10: `InstallPrompt` component

**Files:**
- Create: `client/src/components/InstallPrompt.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/InstallPrompt.jsx`:

```jsx
import { useState, useEffect } from 'react';

const DISMISSED_KEY = 'pwa-install-dismissed';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (isInstalled || dismissed) return;

    // Chrome/Edge/Android: capture beforeinstallprompt
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Safari: show manual instructions if iOS Safari
    const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIosSafari && !dismissed) {
      setIsSafari(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  }

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={dismiss} />
      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-6 max-w-lg mx-auto">
        <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">Install Boulder Tracker</h2>
        <p className="text-sm text-gray-500 mb-5">Add to your home screen for the best experience</p>
        <ul className="space-y-2 mb-6">
          {['Launch like a native app', "Works with your phone's back button", 'No browser chrome — full screen'].map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="text-brand font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        {isSafari ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 mb-4">
            Tap <strong>Share</strong> (↑) in Safari, then <strong>"Add to Home Screen"</strong>
          </div>
        ) : (
          <button
            onClick={install}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition text-base"
          >
            Install App
          </button>
        )}
        <button
          onClick={dismiss}
          className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 py-2 transition"
        >
          Not now
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/InstallPrompt.jsx
git commit -m "feat: add InstallPrompt bottom sheet component"
```

---

## Task 11: `ConflictResolver` component

**Files:**
- Create: `client/src/components/ConflictResolver.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/ConflictResolver.jsx`:

```jsx
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function SessionCard({ label, session, labelClass }) {
  return (
    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className={`text-xs font-bold uppercase tracking-wide mb-3 ${labelClass}`}>{label}</div>
      <div className="space-y-1 text-sm">
        <div><span className="text-gray-500">Date:</span> <span className="font-medium">{session?.date || '—'}</span></div>
        <div><span className="text-gray-500">Location:</span> <span className="font-medium">{session?.location || '—'}</span></div>
        {session?.notes && <div><span className="text-gray-500">Notes:</span> <span className="font-medium">{session.notes}</span></div>}
        <div><span className="text-gray-500">Modified:</span> <span className="font-medium">{formatDate(session?.updated_at)}</span></div>
        <div><span className="text-gray-500">Boulders:</span> <span className="font-medium">{session?.completed_count ?? '—'} topped</span></div>
      </div>
    </div>
  );
}

export default function ConflictResolver() {
  const { conflicts, errors, resolveConflict, discardError } = useOfflineQueue();

  if (conflicts.length === 0 && errors.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Sync Issues</h2>
          <p className="text-sm text-gray-500 mt-1">Resolve these before syncing continues</p>
        </div>

        <div className="p-6 space-y-8">
          {conflicts.map(entry => (
            <div key={entry.id}>
              <div className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                ⚠ Conflict — this session was changed on another device
              </div>
              <div className="flex gap-3 mb-4">
                <SessionCard
                  label="Your version"
                  labelClass="text-brand"
                  session={entry.payload?.data}
                />
                <SessionCard
                  label="Server version"
                  labelClass="text-gray-500"
                  session={entry.serverVersion}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => resolveConflict(entry.id, 'mine')}
                  className="flex-1 bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-full transition text-sm"
                >
                  Keep mine
                </button>
                <button
                  onClick={() => resolveConflict(entry.id, 'server')}
                  className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-2.5 rounded-full transition text-sm"
                >
                  Keep server
                </button>
              </div>
            </div>
          ))}

          {errors.map(entry => (
            <div key={entry.id}>
              <div className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                ✕ Sync failed — {entry.errorMsg || 'server rejected this change'}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                <strong>Action:</strong> {entry.type.replace('_SESSION', ' session').toLowerCase()}
                {entry.payload?.data?.location && ` · ${entry.payload.data.location}`}
              </div>
              <button
                onClick={() => discardError(entry.id)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-full transition text-sm"
              >
                Discard this change
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ConflictResolver.jsx
git commit -m "feat: add ConflictResolver modal component"
```

---

## Task 12: Wire `Dashboard` to use offline queue

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`

- [ ] **Step 1: Replace `apiGetSessions` call with `useOfflineQueue`**

In `client/src/pages/Dashboard.jsx`, replace:
```jsx
import { apiGetSessions } from '../api/sessions.js';
```
with:
```jsx
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
```

Add `useOfflineQueue` to the component:
```jsx
const { getSessions } = useOfflineQueue();
```

Replace the `useEffect`:
```jsx
useEffect(() => {
  getSessions()
    .then(setSessions)
    .catch(() => addToast('Failed to load sessions', 'error'))
    .finally(() => setLoading(false));
}, [getSessions]);
```

In the sessions table rows, add an unsynced badge after the `<td>` for location:
```jsx
<td className="px-4 py-3 text-gray-600">
  {s.location}
  {s.unsynced && (
    <span className="ml-2 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">unsynced</span>
  )}
</td>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat: wire Dashboard to useOfflineQueue for offline-aware session list"
```

---

## Task 13: Wire `SessionNew` and `SessionDetail` to offline queue

**Files:**
- Modify: `client/src/pages/SessionNew.jsx`
- Modify: `client/src/pages/SessionDetail.jsx`

- [ ] **Step 1: Update `SessionNew`**

In `client/src/pages/SessionNew.jsx`, replace:
```jsx
import { apiCreateSession } from '../api/sessions.js';
```
with:
```jsx
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
```

Add to component:
```jsx
const { createSession } = useOfflineQueue();
```

In `handleSubmit`, replace:
```jsx
const data = await apiCreateSession({ ...form, boulders: boulderPayload });
```
with:
```jsx
const data = await createSession({ ...form, boulders: boulderPayload });
```

- [ ] **Step 2: Update `SessionDetail`**

In `client/src/pages/SessionDetail.jsx`, replace:
```jsx
import { apiGetSession, apiUpdateSession } from '../api/sessions.js';
```
with:
```jsx
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
```

Add to component:
```jsx
const { getSession, updateSession, deleteSession } = useOfflineQueue();
```

In the `useEffect`, replace `apiGetSession(id)` with `getSession(id)`.

In `handleSave`, replace:
```jsx
await apiUpdateSession(id, { ...form, boulders: boulderPayload });
```
with:
```jsx
await updateSession(id, { ...form, boulders: boulderPayload });
```

Add a delete button after the save button (only for `canEdit`):

```jsx
{canEdit && (
  <div className="flex gap-3 mt-3">
    <button type="submit" disabled={saving}
      className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition disabled:opacity-50">
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
    <button
      type="button"
      onClick={async () => {
        if (!confirm('Delete this session?')) return;
        await deleteSession(id);
        navigate('/dashboard');
      }}
      className="px-5 py-3 border border-red-300 text-red-600 hover:bg-red-50 font-bold rounded-full transition">
      Delete
    </button>
  </div>
)}
```

Remove the existing save button and replace with the block above.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SessionNew.jsx client/src/pages/SessionDetail.jsx
git commit -m "feat: wire SessionNew and SessionDetail to useOfflineQueue"
```

---

## Task 14: Wire everything in `App.jsx` and deploy

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add providers and global components to `App.jsx`**

Replace the entire content of `client/src/App.jsx` with:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import { OfflineQueueProvider } from './hooks/useOfflineQueue.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import ConflictResolver from './components/ConflictResolver.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Upgrade from './pages/Upgrade.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SessionNew from './pages/SessionNew.jsx';
import SessionDetail from './pages/SessionDetail.jsx';
import Progress from './pages/Progress.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <OfflineQueueProvider>
            <OfflineBanner />
            <InstallPrompt />
            <ConflictResolver />
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
          </OfflineQueueProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Build and verify**

```cmd
npm run build --prefix client
```
Expected: Build succeeds; `client/dist/sw.js` present; no errors.

- [ ] **Step 3: Commit and push**

```bash
git add client/src/App.jsx
git commit -m "feat: wire PWA providers and global components into App"
git push
```

Wait for Vercel to redeploy. Open the deployed URL in Chrome DevTools → Application → Manifest to verify the PWA manifest is detected. Open Application → Service Workers to verify the SW is registered.

- [ ] **Step 4: Verify install prompt**

On an Android device or Chrome desktop (with "App installs" enabled), navigate to the deployed URL. After logging in, the bottom sheet install prompt should appear.

- [ ] **Step 5: Verify offline behaviour**

In Chrome DevTools → Network → tick "Offline". Refresh the page — the app shell should load. The amber offline banner should appear. Navigate to Dashboard — sessions should load from cache.
