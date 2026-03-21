const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isTest = process.env.NODE_ENV === 'test';
const dataDir = path.join(__dirname, '..', 'data');

if (!isTest && !fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = isTest ? ':memory:' : path.join(dataDir, 'climbing.db');
const db = new Database(dbPath);
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
