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
