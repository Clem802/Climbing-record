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
