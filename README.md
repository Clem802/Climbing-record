# Climbing Boulder Tracker

A full-stack web app for tracking indoor climbing boulder problems. Log sessions, earn points, and visualize your progress.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
# Install root dependencies
npm install

# Install server and client dependencies
npm install --prefix server
npm install --prefix client

# Seed the database with demo data
npm run seed
```

### Development

```bash
npm run dev
```

Opens:
- Client: http://localhost:5173
- Server: http://localhost:3001

### Demo Accounts

| Email | Password | Role |
|---|---|---|
| admin@climbing.app | admin123 | Admin |
| demo@climbing.app | demo123 | User |

## Scoring

| Attempts | Points |
|---|---|
| 1 (flash) | 10 |
| 2 | 7 |
| 3 | 4 |
| 4+ | 1 |

Max score per session: **350 points** (35 flashes)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both client and server in development mode |
| `npm run seed` | Seed the database with demo users and sessions |
| `npm test --prefix server` | Run server tests |
| `npm test --prefix client` | Run client component tests |
