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
