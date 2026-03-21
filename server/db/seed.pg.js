require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = neon(process.env.DATABASE_URL);

const SALT_ROUNDS = 10;
const LOCATIONS = ['The Reach', 'Boulder World', 'VCC', 'Gravity Vault', 'Movement'];

function randomAttempts() {
  const r = Math.random();
  if (r < 0.3) return 1;
  if (r < 0.55) return 2;
  if (r < 0.75) return 3;
  return 4;
}

function generateSession(userId, daysAgo, location) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().slice(0, 10);
  const numCompleted = Math.floor(Math.random() * 11) + 20;
  const boulderNums = Array.from({ length: 35 }, (_, i) => i + 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, numCompleted);
  return { userId, dateStr, location, boulders: boulderNums.map(n => ({ number: n, attempts: randomAttempts() })) };
}

async function seed() {
  console.log('Seeding database...');

  const existing = await sql`
    SELECT id FROM users WHERE email IN ('admin@climbing.app', 'demo@climbing.app')
  `;
  if (existing.length > 0) {
    console.log('Seed data already exists. Delete it first if you want to re-seed.');
    return;
  }

  const adminHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  const [admin] = await sql`
    INSERT INTO users (email, name, password_hash, role, subscription_status)
    VALUES ('admin@climbing.app', 'Admin', ${adminHash}, 'admin', 'active')
    RETURNING id
  `;
  console.log(`Created admin: admin@climbing.app (id: ${admin.id})`);

  const demoHash = await bcrypt.hash('demo123', SALT_ROUNDS);
  const [demo] = await sql`
    INSERT INTO users (email, name, password_hash, role, subscription_status)
    VALUES ('demo@climbing.app', 'Demo Climber', ${demoHash}, 'user', 'active')
    RETURNING id
  `;
  console.log(`Created demo user: demo@climbing.app (id: ${demo.id})`);

  const sessionDays = [85, 78, 71, 63, 55, 45, 36, 25, 14, 4];
  for (let i = 0; i < sessionDays.length; i++) {
    const location = LOCATIONS[i % LOCATIONS.length];
    const sessionData = generateSession(demo.id, sessionDays[i], location);

    const [session] = await sql`
      INSERT INTO sessions (user_id, date, location)
      VALUES (${demo.id}, ${sessionData.dateStr}, ${location})
      RETURNING id
    `;

    for (const b of sessionData.boulders) {
      await sql`
        INSERT INTO boulders (session_id, boulder_number, attempts)
        VALUES (${session.id}, ${b.number}, ${b.attempts})
      `;
    }

    const pts = sessionData.boulders.reduce((sum, b) =>
      sum + (b.attempts === 1 ? 10 : b.attempts === 2 ? 7 : b.attempts === 3 ? 4 : 1), 0);
    console.log(`  Session ${i + 1}: ${sessionData.dateStr} @ ${location} — ${sessionData.boulders.length} boulders, ${pts} pts`);
  }

  console.log('\nSeed complete!');
  console.log('  admin@climbing.app / admin123');
  console.log('  demo@climbing.app  / demo123');
}

seed().catch(err => { console.error(err); process.exit(1); });
