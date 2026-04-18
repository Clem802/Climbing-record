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
        'UPDATE sessions SET date = $1, location = $2, notes = $3, updated_at = NOW() WHERE id = $4',
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
