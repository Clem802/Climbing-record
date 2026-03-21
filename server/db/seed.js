const bcrypt = require('bcrypt');
const db = require('./database');

const SALT_ROUNDS = 10;

const LOCATIONS = ['The Reach', 'Boulder World', 'VCC', 'Gravity Vault', 'Movement'];

function randomAttempts() {
  const r = Math.random();
  if (r < 0.3) return 1;  // 30% flash
  if (r < 0.55) return 2; // 25% two attempts
  if (r < 0.75) return 3; // 20% three attempts
  return 4;               // 25% four+
}

function generateSession(userId, daysAgo, location) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().slice(0, 10);

  // Generate 20-30 completed boulders out of 35
  const numCompleted = Math.floor(Math.random() * 11) + 20;
  const boulderNums = Array.from({ length: 35 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, numCompleted);

  return { userId, dateStr, location, boulders: boulderNums.map(n => ({ number: n, attempts: randomAttempts() })) };
}

async function seed() {
  console.log('Seeding database...');

  // Check if already seeded
  const existing = db.prepare("SELECT id FROM users WHERE email IN ('admin@climbing.app', 'demo@climbing.app')").all();
  if (existing.length > 0) {
    console.log('Seed data already exists. Skipping.');
    return;
  }

  // Create admin
  const adminHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  const adminResult = db.prepare(
    "INSERT INTO users (email, name, password_hash, role, subscription_status) VALUES (?, ?, ?, 'admin', 'active')"
  ).run('admin@climbing.app', 'Admin', adminHash);
  console.log(`Created admin: admin@climbing.app (id: ${adminResult.lastInsertRowid})`);

  // Create demo user
  const demoHash = await bcrypt.hash('demo123', SALT_ROUNDS);
  const demoResult = db.prepare(
    "INSERT INTO users (email, name, password_hash, role, subscription_status) VALUES (?, ?, ?, 'user', 'active')"
  ).run('demo@climbing.app', 'Demo Climber', demoHash);
  const demoId = demoResult.lastInsertRowid;
  console.log(`Created demo user: demo@climbing.app (id: ${demoId})`);

  // Generate 10 sessions spread over last 90 days
  const sessionDays = [85, 78, 71, 63, 55, 45, 36, 25, 14, 4];
  const insertSession = db.prepare('INSERT INTO sessions (user_id, date, location) VALUES (?, ?, ?)');
  const insertBoulder = db.prepare('INSERT INTO boulders (session_id, boulder_number, attempts) VALUES (?, ?, ?)');

  for (let i = 0; i < sessionDays.length; i++) {
    const location = LOCATIONS[i % LOCATIONS.length];
    const sessionData = generateSession(demoId, sessionDays[i], location);
    const sResult = insertSession.run(demoId, sessionData.dateStr, location);
    const sessionId = sResult.lastInsertRowid;
    for (const b of sessionData.boulders) {
      insertBoulder.run(sessionId, b.number, b.attempts);
    }
    const pts = sessionData.boulders.reduce((sum, b) => {
      return sum + (b.attempts === 1 ? 10 : b.attempts === 2 ? 7 : b.attempts === 3 ? 4 : 1);
    }, 0);
    console.log(`  Session ${i + 1}: ${sessionData.dateStr} @ ${location} — ${sessionData.boulders.length} boulders, ${pts} pts`);
  }

  console.log('\nSeed complete!');
  console.log('  admin@climbing.app / admin123');
  console.log('  demo@climbing.app  / demo123');
}

seed().catch(console.error);
