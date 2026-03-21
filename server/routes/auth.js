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
