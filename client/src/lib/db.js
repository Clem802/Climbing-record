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
