// server/tests/sessions.test.js
const request = require('supertest');
const app = require('../index');
const db = require('../db/database');

let agent;
let userId;

beforeEach(async () => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');
  agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({
    email: 'climber@example.com', name: 'Climber', password: 'password123'
  });
  userId = res.body.user.id;
});

afterAll(() => {
  db.exec('DELETE FROM boulders; DELETE FROM sessions; DELETE FROM users;');
});

describe('POST /api/sessions', () => {
  it('creates a session with boulders and returns summary fields', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01',
      location: 'The Reach',
      boulders: [
        { boulder_number: 1, attempts: 1 },
        { boulder_number: 2, attempts: 2 },
        { boulder_number: 3, attempts: 4 },
      ]
    });
    expect(res.status).toBe(201);
    expect(res.body.total_points).toBe(10 + 7 + 1); // 18
    expect(res.body.completed_count).toBe(3);
    expect(res.body.flash_count).toBe(1);
    expect(res.body.boulders).toHaveLength(3);
  });

  it('allows empty boulder array (zero session)', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    expect(res.status).toBe(201);
    expect(res.body.total_points).toBe(0);
  });

  it('rejects boulder_number out of range', async () => {
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 36, attempts: 1 }]
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 for inactive user', async () => {
    db.prepare("UPDATE users SET subscription_status = 'inactive' WHERE id = ?").run(userId);
    const res = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions', () => {
  it('returns only the logged-in user sessions', async () => {
    await agent.post('/api/sessions').send({ date: '2026-03-01', location: 'Gym', boulders: [] });

    const agent2 = request.agent(app);
    await agent2.post('/api/auth/register').send({
      email: 'other@example.com', name: 'Other', password: 'password123'
    });
    await agent2.post('/api/sessions').send({ date: '2026-03-02', location: 'Gym2', boulders: [] });

    const res = await agent.get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].location).toBe('Gym');
  });
});

describe('PUT /api/sessions/:id', () => {
  it('replaces boulder rows atomically', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 1, attempts: 1 }]
    });
    const sessionId = create.body.id;

    const res = await agent.put(`/api/sessions/${sessionId}`).send({
      date: '2026-03-01', location: 'Gym Updated',
      boulders: [
        { boulder_number: 2, attempts: 2 },
        { boulder_number: 3, attempts: 3 },
      ]
    });
    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Gym Updated');
    expect(res.body.boulders).toHaveLength(2);
    expect(res.body.total_points).toBe(7 + 4); // 11
  });

  it('returns 403 when trying to edit another user session', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym', boulders: []
    });
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/register').send({
      email: 'attacker@example.com', name: 'Attacker', password: 'password123'
    });
    const res = await agent2.put(`/api/sessions/${create.body.id}`).send({
      date: '2026-03-01', location: 'Hacked', boulders: []
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes session and cascades to boulders', async () => {
    const create = await agent.post('/api/sessions').send({
      date: '2026-03-01', location: 'Gym',
      boulders: [{ boulder_number: 1, attempts: 1 }]
    });
    const res = await agent.delete(`/api/sessions/${create.body.id}`);
    expect(res.status).toBe(204);
    const boulders = db.prepare('SELECT * FROM boulders WHERE session_id = ?').all(create.body.id);
    expect(boulders).toHaveLength(0);
  });
});
