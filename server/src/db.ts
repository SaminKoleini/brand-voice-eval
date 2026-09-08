import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '..', 'data.db')

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    copy_instruction TEXT DEFAULT '',
    hook_instruction TEXT DEFAULT '',
    title_instruction TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    title TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    video_filename TEXT,
    reference_title TEXT DEFAULT '',
    reference_hook TEXT DEFAULT '',
    reference_social_copy TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL,
    results_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
  );
`)

export function nowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
