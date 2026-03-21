// server/tests/auth.test.js
const request = require('supertest');
const app = require('../index');
const db = require('../db/database');

beforeEach(() => {
  db.exec(`DELETE FROM users`);
});

afterAll(() => {
  db.exec(`DELETE FROM users`);
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com', name: 'Test User', password: 'password123'
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', name: 'A', password: 'password123'
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', name: 'B', password: 'password123'
    });
    expect(res.status).toBe(409);
  });

  it('rejects short password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'short@example.com', name: 'A', password: 'abc'
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@example.com', name: 'Login User', password: 'password123'
    });
  });

  it('returns 200 and sets cookie on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com', password: 'password123'
    });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com', password: 'wrong'
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user when authenticated', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'me@example.com', name: 'Me User', password: 'password123'
    });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'logout@example.com', name: 'Logout', password: 'password123'
    });
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});
