import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || './data/myta.db';
    // Ensure parent directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  // Try source location first (dev), then dist location (prod)
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const schema = readFileSync(path, 'utf-8');
      db.exec(schema);
      return;
    }
  }
  throw new Error('schema.sql not found');
}
