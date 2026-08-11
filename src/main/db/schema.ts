/**
 * Typed query wrappers for all DB tables.
 * All DB access goes through here — not raw SQL in IPC handlers.
 */

import type Database from 'better-sqlite3'
import type {
  Problem,
  FsrsState,
  ReviewLog,
  LeetCodeProblem,
  DailyPick,
  SettingKey,
} from '../../shared/types'

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSetting(db: Database.Database, key: SettingKey): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: SettingKey, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
    key,
    value,
    value
  )
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ── Problems ──────────────────────────────────────────────────────────────────

export function insertProblem(
  db: Database.Database,
  p: Omit<Problem, 'id' | 'created_at' | 'is_leech'>
): number {
  const result = db
    .prepare(
      `INSERT INTO problems (title, url, source, pattern_tags, recognition_cue, difficulty)
       VALUES (@title, @url, @source, @pattern_tags, @recognition_cue, @difficulty)`
    )
    .run(p) as Database.RunResult
  return result.lastInsertRowid as number
}

export function getProblemById(db: Database.Database, id: number): Problem | null {
  return (db.prepare('SELECT * FROM problems WHERE id = ?').get(id) as Problem) ?? null
}

export function searchProblems(db: Database.Database, query: string): Problem[] {
  return db
    .prepare(
      `SELECT * FROM problems
       WHERE title LIKE ? OR pattern_tags LIKE ?
       ORDER BY created_at DESC LIMIT 100`
    )
    .all(`%${query}%`, `%${query}%`) as Problem[]
}

export function listProblems(
  db: Database.Database,
  opts: { tag?: string; is_leech?: boolean; limit?: number; offset?: number } = {}
): Problem[] {
  const clauses: string[] = []
  const params: unknown[] = []

  if (opts.tag) {
    clauses.push("pattern_tags LIKE ?")
    params.push(`%${opts.tag}%`)
  }
  if (opts.is_leech !== undefined) {
    clauses.push("is_leech = ?")
    params.push(opts.is_leech ? 1 : 0)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0

  return db
    .prepare(`SELECT * FROM problems ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Problem[]
}

export function setLeechFlag(db: Database.Database, problem_id: number, is_leech: boolean): void {
  db.prepare('UPDATE problems SET is_leech = ? WHERE id = ?').run(is_leech ? 1 : 0, problem_id)
}

// ── FSRS state ────────────────────────────────────────────────────────────────

export function upsertFsrsState(db: Database.Database, state: FsrsState): void {
  db.prepare(`
    INSERT INTO fsrs_state (problem_id, stability, difficulty, reps, lapses, state, due_at, last_review_at)
    VALUES (@problem_id, @stability, @difficulty, @reps, @lapses, @state, @due_at, @last_review_at)
    ON CONFLICT(problem_id) DO UPDATE SET
      stability = @stability,
      difficulty = @difficulty,
      reps = @reps,
      lapses = @lapses,
      state = @state,
      due_at = @due_at,
      last_review_at = @last_review_at
  `).run(state)
}

export function getFsrsState(db: Database.Database, problem_id: number): FsrsState | null {
  return (
    (db.prepare('SELECT * FROM fsrs_state WHERE problem_id = ?').get(problem_id) as FsrsState) ?? null
  )
}

export function getDueReviews(
  db: Database.Database,
  today: string,
  cap: number
): (Problem & FsrsState & { retrievability: number })[] {
  // Join problems + fsrs_state for cards due today or earlier
  // Sort by retrievability ascending (most likely forgotten first)
  return db
    .prepare(
      `SELECT p.*, fs.*,
        COALESCE(
          EXP(-0.693 * (julianday('now') - julianday(fs.last_review_at)) / NULLIF(fs.stability, 0)),
          0
        ) AS retrievability
       FROM problems p
       JOIN fsrs_state fs ON fs.problem_id = p.id
       WHERE fs.due_at <= ? AND fs.reps > 0
       ORDER BY retrievability ASC
       LIMIT ?`
    )
    .all(today, cap) as (Problem & FsrsState & { retrievability: number })[]
}

// ── Review log ────────────────────────────────────────────────────────────────

export function insertReviewLog(
  db: Database.Database,
  log: Omit<ReviewLog, 'id' | 'reviewed_at'>
): void {
  db.prepare(
    `INSERT INTO review_log (problem_id, grade, interval_days, retrievability_at_review)
     VALUES (@problem_id, @grade, @interval_days, @retrievability_at_review)`
  ).run(log)
}

export function getAgainCountForProblem(db: Database.Database, problem_id: number): number {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM review_log WHERE problem_id = ? AND grade = 1')
    .get(problem_id) as { cnt: number }
  return row.cnt
}

// ── LeetCode cache ────────────────────────────────────────────────────────────

export function upsertLeetCodeProblem(db: Database.Database, p: LeetCodeProblem): void {
  db.prepare(`
    INSERT INTO leetcode_problems (slug, title, difficulty, tags, url, cached_at)
    VALUES (@slug, @title, @difficulty, @tags, @url, @cached_at)
    ON CONFLICT(slug) DO UPDATE SET
      title = @title, difficulty = @difficulty, tags = @tags, url = @url, cached_at = @cached_at
  `).run(p)
}

export function searchLeetCodeProblems(db: Database.Database, query: string, limit = 20): LeetCodeProblem[] {
  return db
    .prepare(
      `SELECT * FROM leetcode_problems WHERE title LIKE ? ORDER BY title LIMIT ?`
    )
    .all(`%${query}%`, limit) as LeetCodeProblem[]
}

export function getLeetCodeCacheAge(db: Database.Database): string | null {
  const row = db
    .prepare('SELECT MAX(cached_at) as latest FROM leetcode_problems')
    .get() as { latest: string | null }
  return row.latest
}

export function countLeetCodeCache(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM leetcode_problems').get() as { cnt: number }
  return row.cnt
}

export function getLeetCodeBySlug(db: Database.Database, slug: string): LeetCodeProblem | null {
  return (db.prepare('SELECT * FROM leetcode_problems WHERE slug = ?').get(slug) as LeetCodeProblem) ?? null
}

export function getLeetCodeByTag(
  db: Database.Database,
  tag: string,
  difficulty: string | null,
  excludeSlugs: string[]
): LeetCodeProblem[] {
  const placeholders = excludeSlugs.map(() => '?').join(', ')
  const excludeClause = excludeSlugs.length
    ? `AND slug NOT IN (${placeholders})`
    : ''
  const diffClause = difficulty ? 'AND difficulty = ?' : ''
  const params: unknown[] = [`%${tag}%`]
  if (difficulty) params.push(difficulty)
  params.push(...excludeSlugs)

  return db
    .prepare(
      `SELECT * FROM leetcode_problems
       WHERE tags LIKE ? ${diffClause} ${excludeClause}
       ORDER BY RANDOM() LIMIT 20`
    )
    .all(...params) as LeetCodeProblem[]
}

// ── Daily picks ───────────────────────────────────────────────────────────────

export function getTodayPicks(db: Database.Database, today: string): DailyPick[] {
  return db
    .prepare("SELECT * FROM daily_picks WHERE surfaced_at = ?")
    .all(today) as DailyPick[]
}

export function insertDailyPick(db: Database.Database, slug: string, today: string): number {
  const result = db
    .prepare('INSERT INTO daily_picks (slug, surfaced_at, status) VALUES (?, ?, ?)')
    .run(slug, today, 'pending') as Database.RunResult
  return result.lastInsertRowid as number
}

export function updateDailyPickStatus(
  db: Database.Database,
  pick_id: number,
  status: DailyPick['status']
): void {
  db.prepare('UPDATE daily_picks SET status = ? WHERE id = ?').run(status, pick_id)
}

export function getRecentlyPickedSlugs(db: Database.Database, withinDays: number): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT slug FROM daily_picks
       WHERE surfaced_at >= date('now', ? || ' days')`
    )
    .all(`-${withinDays}`) as { slug: string }[]
  return rows.map(r => r.slug)
}

export function getSolvedSlugs(db: Database.Database): string[] {
  // Any problem in the problems table that was auto-added from LeetCode cache
  const rows = db
    .prepare(`SELECT p.url FROM problems p WHERE p.url IS NOT NULL`)
    .all() as { url: string }[]
  // Extract slug from URL: https://leetcode.com/problems/<slug>/
  return rows
    .map(r => {
      const match = r.url?.match(/problems\/([^/]+)/)
      return match ? match[1] : null
    })
    .filter(Boolean) as string[]
}
