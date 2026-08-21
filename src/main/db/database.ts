import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { DEFAULT_SETTINGS } from '../../shared/types'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.')
  return _db
}

export function initDatabase(): void {
  const dbPath = app
    ? join(app.getPath('userData'), 'dsa_srs.db')
    : join(__dirname, '../../../dsa_srs_dev.db')

  _db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  runMigrations(_db)
  seedDefaultSettings(_db)
}

import { sql as initialMigration } from './migrations/001_initial'
import { sql as dailyPicksMigration } from './migrations/002_daily_picks_fields'

function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const applied = new Set<string>(
    (db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[])
      .map(r => r.filename)
  )

  const migrations = [
    { filename: '001_initial.sql', sql: initialMigration },
    { filename: '002_daily_picks_fields.sql', sql: dailyPicksMigration },
  ]

  for (const migration of migrations) {
    if (applied.has(migration.filename)) continue

    db.exec(migration.sql)
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(migration.filename)
    console.log(`[DB] Applied migration: ${migration.filename}`)
  }
}

function seedDefaultSettings(db: Database.Database): void {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `)

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      upsert.run(key, value)
    }
  })

  tx()
}
