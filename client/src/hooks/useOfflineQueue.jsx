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
