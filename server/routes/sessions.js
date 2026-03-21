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
  const user = db.prepare('SELECT subscription_status FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.subscription_status === 'inactive') {
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

// MUST be before /:id to avoid 'full' being treated as an id
router.get('/full', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY date ASC').all(req.user.id);
  const result = sessions.map(s => {
    const boulderRows = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(s.id);
    const boulderList = boulderRows.map(b => ({ ...b, points: computePoints(b.attempts) }));
    return { ...buildSessionSummary(s, boulderRows), boulders: boulderList };
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
