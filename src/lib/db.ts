import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "soma.db");

function resolveDbPath(): string {
  return process.env.SOMA_DB_PATH || DEFAULT_DB_PATH;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createConnection(): Database.Database {
  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    ensureDir(dbPath);
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assignee_id INTEGER NULL REFERENCES members(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
      due_date TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// Module-level singleton, cached per resolved db path so tests can swap
// SOMA_DB_PATH between runs and get a fresh connection.
let cached: { path: string; db: Database.Database } | null = null;

export function getDb(): Database.Database {
  const dbPath = resolveDbPath();
  if (!cached || cached.path !== dbPath) {
    cached = { path: dbPath, db: createConnection() };
  }
  return cached.db;
}

/** For tests: closes and clears the cached connection so a new path can be used. */
export function resetDbForTests(): void {
  if (cached) {
    cached.db.close();
    cached = null;
  }
}
