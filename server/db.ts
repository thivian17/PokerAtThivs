import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. In Replit: Tools → Database → create a PostgreSQL database.");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: /sslmode=require|neon\.tech/.test(process.env.DATABASE_URL ?? "") ? { rejectUnauthorized: false } : undefined,
});

export const q = <T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) =>
  pool.query<T>(text, params);

export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS allowlist (
      email TEXT PRIMARY KEY,
      name TEXT,
      source TEXT NOT NULL CHECK (source IN ('form','csv','manual','admin')),
      response_id TEXT,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      admin_unlocked BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_unlocked BOOLEAN NOT NULL DEFAULT false;
  `);
}
