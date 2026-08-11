export const sql = `
-- Migration 001: Initial schema

-- ── Problems ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,
  pattern_tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  recognition_cue TEXT,
  difficulty TEXT,                           -- 'Easy' | 'Medium' | 'Hard'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_leech INTEGER DEFAULT 0                -- 0 = false, 1 = true
);

-- ── FSRS state (one row per problem) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fsrs_state (
  problem_id INTEGER PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  stability REAL,
  difficulty REAL,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT DEFAULT 'New',   -- 'New' | 'Learning' | 'Review' | 'Relearning'
  due_at DATETIME,
  last_review_at DATETIME
);

-- ── Review log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  grade INTEGER NOT NULL,                    -- 1=Again 2=Hard 3=Good 4=Easy
  interval_days REAL,
  retrievability_at_review REAL
);

-- ── Settings (key/value) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── LeetCode problem cache ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leetcode_problems (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  difficulty TEXT,
  tags TEXT,          -- JSON array of tag strings
  url TEXT,
  cached_at DATETIME
);

-- ── Daily picks tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  surfaced_at TEXT NOT NULL,              -- ISO date YYYY-MM-DD
  status TEXT DEFAULT 'pending'          -- 'pending' | 'solved' | 'struggled' | 'skipped'
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fsrs_due_at ON fsrs_state(due_at);
CREATE INDEX IF NOT EXISTS idx_review_log_problem ON review_log(problem_id);
CREATE INDEX IF NOT EXISTS idx_daily_picks_date ON daily_picks(surfaced_at);
CREATE INDEX IF NOT EXISTS idx_lc_title ON leetcode_problems(title);
`;
