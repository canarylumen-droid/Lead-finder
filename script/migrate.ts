import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Non-destructive migration: creates tables and columns only if they don't exist.
// Safe to run on every deploy — existing data is never dropped.
const sql = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  niches TEXT NOT NULL,
  cities TEXT NOT NULL,
  country TEXT NOT NULL,
  max_reviews INTEGER NOT NULL DEFAULT 40,
  target_volume INTEGER NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'running',
  leads_count INTEGER NOT NULL DEFAULT 0,
  email_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add include_phone if it was missing from an older migration
ALTER TABLE scrape_sessions ADD COLUMN IF NOT EXISTS include_phone INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON scrape_sessions(user_id);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES scrape_sessions(id),
  user_id INTEGER NOT NULL,
  niche TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  rating TEXT,
  reviews_count INTEGER,
  address TEXT,
  email TEXT,
  email_verified INTEGER DEFAULT 0,
  maps_url TEXT,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_session_name_city_idx ON leads(session_id, name, city);
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_session_scraped ON leads(session_id, scraped_at DESC);
`;

async function main() {
  await pool.query(sql);
  console.log("Schema created successfully");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
