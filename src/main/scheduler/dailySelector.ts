/**
 * Daily Problem Selection Algorithm
 *
 * Picks `new_cards_per_day` (default 2) unsolved LeetCode problems each day.
 * The user never types anything to get a new problem — the app decides.
 *
 * Selection logic (v1 heuristic):
 *  1. Load the pattern rotation list from settings
 *  2. For each pattern, compute a weight:
 *     - Base: 1 / (solved_count + 1)  → favor least-covered patterns
 *     - Boost ×1.5 if pattern has leeches (reinforcement need)
 *  3. Weighted-random pick a pattern
 *  4. Within that pattern, pick a problem matching the difficulty band
 *     (default: Easy 15%, Medium 70%, Hard 15%)
 *     that is not in the solved set and not recently surfaced
 *  5. Repeat until we have `new_cards_per_day` picks
 */

import type Database from 'better-sqlite3'
import {
  getSetting,
  getSolvedSlugs,
  getRecentlyPickedSlugs,
  getLeetCodeByTag,
  listProblems,
  getTodayPicks,
  insertDailyPick,
} from '../db/schema'
import type { LeetCodeProblem, TodayNewPick } from '../../shared/types'

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

// ── Difficulty band sampling ───────────────────────────────────────────────────

function sampleDifficulty(band: { Easy: number; Medium: number; Hard: number }): string {
  const r = Math.random() * 100
  if (r < band.Easy) return 'Easy'
  if (r < band.Easy + band.Medium) return 'Medium'
  return 'Hard'
}

// ── Weighted random pick from array ──────────────────────────────────────────

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// ── Main selector ─────────────────────────────────────────────────────────────

export function selectDailyProblems(db: Database.Database): TodayNewPick[] {
  const today = TODAY_ISO()

  // Check if we already have pending picks for today
  const existingPicks = getTodayPicks(db, today).filter(p => p.status === 'pending')
  if (existingPicks.length > 0) {
    // Hydrate directly from the daily_picks row — no dependency on leetcode_problems
    const result: TodayNewPick[] = []
    for (const pick of existingPicks) {
      const tags = tryParseJson<string[]>(pick.tags ?? '[]') ?? []
      result.push({
        type: 'new',
        pick_id: pick.id,
        slug: pick.slug,
        title: pick.title ?? '(untitled)',
        url: pick.url ?? '',
        difficulty: (pick.difficulty as string) ?? null,
        primary_tag: tags[0] ?? null,
      })
    }
    if (result.length > 0) return result
  }

  // Load settings
  const newPerDay = parseInt(getSetting(db, 'new_cards_per_day') ?? '2', 10)
  const patternRotation = tryParseJson<string[]>(
    getSetting(db, 'pattern_rotation') ?? '[]'
  ) ?? []
  const diffBand = tryParseJson<{ Easy: number; Medium: number; Hard: number }>(
    getSetting(db, 'difficulty_progression') ?? '{}'
  ) ?? { Easy: 15, Medium: 70, Hard: 15 }

  // Build exclusion sets
  const solvedSlugs = new Set(getSolvedSlugs(db))
  // Cooldown = 14 days before resurfacing a skipped problem
  const recentSlugs = new Set(getRecentlyPickedSlugs(db, 14))

  // Count solved per pattern (for weighting)
  const allProblems = listProblems(db, { limit: 9999 })
  const patternSolvedCount: Record<string, number> = {}
  const patternLeechCount: Record<string, number> = {}

  for (const p of allProblems) {
    const tags = tryParseJson<string[]>(p.pattern_tags) ?? []
    for (const tag of tags) {
      patternSolvedCount[tag] = (patternSolvedCount[tag] ?? 0) + 1
      if (p.is_leech) {
        patternLeechCount[tag] = (patternLeechCount[tag] ?? 0) + 1
      }
    }
  }

  const selected: TodayNewPick[] = []
  const selectedSlugsThisSession = new Set<string>()

  let attempts = 0
  while (selected.length < newPerDay && attempts < 50) {
    attempts++

    if (patternRotation.length === 0) break

    // Compute weights for each pattern
    const weights = patternRotation.map(pattern => {
      const solved = patternSolvedCount[pattern] ?? 0
      const leeches = patternLeechCount[pattern] ?? 0
      let w = 1 / (solved + 1)
      if (leeches > 0) w *= 1.5
      return w
    })

    const chosenPattern = weightedRandom(patternRotation, weights)
    const difficulty = sampleDifficulty(diffBand)

    // Find candidates from LC cache
    const excludeSlugs = [
      ...Array.from(solvedSlugs),
      ...Array.from(recentSlugs),
      ...Array.from(selectedSlugsThisSession),
    ]

    const candidates = getLeetCodeByTag(db, chosenPattern, difficulty, excludeSlugs)

    if (candidates.length === 0) {
      // Try without difficulty filter
      const candidatesAny = getLeetCodeByTag(db, chosenPattern, null, excludeSlugs)
      if (candidatesAny.length === 0) continue
      candidates.push(...candidatesAny)
    }

    const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))]

    if (!pick || selectedSlugsThisSession.has(pick.slug)) continue

    selectedSlugsThisSession.add(pick.slug)

    // Insert into daily_picks (store display fields alongside slug)
    const pickId = insertDailyPick(
      db,
      { slug: pick.slug, title: pick.title, url: pick.url, difficulty: pick.difficulty, tags: pick.tags },
      today
    )

    const tags = tryParseJson<string[]>(pick.tags) ?? []
    selected.push({
      type: 'new',
      pick_id: pickId,
      slug: pick.slug,
      title: pick.title,
      url: pick.url,
      difficulty: pick.difficulty,
      primary_tag: tags[0] ?? chosenPattern,
    })
  }

  return selected
}

function tryParseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

// Utility: verify that calling selectDailyProblems twice in the same day returns
// the same pick_ids and does not insert extra rows (useful for a short test)
export function verifySelectDailyProblemsIdempotent(db: Database.Database): boolean {
  const beforeRow = db.prepare('SELECT COUNT(*) as cnt FROM daily_picks').get() as { cnt: number }
  const beforeTotal = beforeRow.cnt
  const first = selectDailyProblems(db).map(p => p.pick_id).sort((a, b) => a - b)
  const afterRow = db.prepare('SELECT COUNT(*) as cnt FROM daily_picks').get() as { cnt: number }
  const afterTotal = afterRow.cnt
  const second = selectDailyProblems(db).map(p => p.pick_id).sort((a, b) => a - b)
  const finalRow = db.prepare('SELECT COUNT(*) as cnt FROM daily_picks').get() as { cnt: number }
  const finalTotal = finalRow.cnt

  const idsSame = JSON.stringify(first) === JSON.stringify(second)
  // No unexpected row insert: finalTotal should equal afterTotal (no inserts during the second call)
  const noUnexpectedInserts = finalTotal === afterTotal
  // Also ensure that some picks exist (sanity)
  const hadPicks = first.length > 0
  return idsSame && noUnexpectedInserts && hadPicks
}
