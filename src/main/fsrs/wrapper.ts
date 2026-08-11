/**
 * FSRS Wrapper
 *
 * Wraps `ts-fsrs` with the min-first-interval clamp described in the spec:
 *
 *   nextInterval = fsrsResult.interval
 *   if (card.reps === 0) {
 *     nextInterval = Math.max(nextInterval, MIN_FIRST_INTERVAL_DAYS)
 *   }
 *
 * After the first successful review, FSRS drives intervals directly — no more clamping.
 *
 * Key design decisions:
 * - No same-day learning steps: first solve = Review #1
 * - Grade mapping: Again=1 Hard=2 Good=3 Easy=4 → ts-fsrs Rating.Again/Hard/Good/Easy
 * - desired_retention is passed in from settings (default 0.85)
 * - MIN_FIRST_INTERVAL_DAYS is passed in from settings (default 5)
 */

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type RecordLog } from 'ts-fsrs'
import type { FsrsState, Grade } from '../../shared/types'

// Map app grades (1–4) to ts-fsrs Rating enum
const GRADE_TO_RATING: Record<Grade, Rating> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
}

export interface ScheduleResult {
  /** Updated FSRS state to persist */
  newState: Omit<FsrsState, 'problem_id'>
  /** The clamped interval in days that was actually applied */
  intervalDays: number
  /** Retrievability at time of review (before grading) */
  retrievability: number
}

/**
 * Convert a persisted FsrsState row back into a ts-fsrs Card object.
 */
function stateToCard(state: FsrsState | null): Card {
  if (!state || state.reps === 0) {
    return createEmptyCard()
  }

  const card = createEmptyCard()
  // ts-fsrs Card fields
  card.stability = state.stability ?? 0
  card.difficulty = state.difficulty ?? 0
  card.reps = state.reps
  card.lapses = state.lapses
  card.state = (() => {
    switch (state.state) {
      case 'Learning': return 1  // State.Learning
      case 'Review': return 2    // State.Review
      case 'Relearning': return 3 // State.Relearning
      default: return 0          // State.New
    }
  })()
  card.due = state.due_at ? new Date(state.due_at) : new Date()
  card.last_review = state.last_review_at ? new Date(state.last_review_at) : undefined
  return card
}

const STATE_NAMES = ['New', 'Learning', 'Review', 'Relearning'] as const

/**
 * Schedule a review for a problem.
 *
 * @param currentState  Current FSRS state from DB (null = brand new card)
 * @param grade         User's grade (1=Again 2=Hard 3=Good 4=Easy)
 * @param desiredRetention  From settings (e.g. 0.85)
 * @param minFirstIntervalDays  From settings (e.g. 5)
 * @returns ScheduleResult with the new state and clamped interval
 */
export function scheduleReview(
  currentState: FsrsState | null,
  grade: Grade,
  desiredRetention: number,
  minFirstIntervalDays: number
): ScheduleResult {
  const params = generatorParameters({ request_retention: desiredRetention })
  const f = fsrs(params)
  const card = stateToCard(currentState)
  const isFirstReview = !currentState || currentState.reps === 0

  const now = new Date()
  const recordLog: RecordLog = f.repeat(card, now)
  const rating = GRADE_TO_RATING[grade]
  const result = recordLog[rating as keyof RecordLog]

  if (!result) {
    throw new Error(`Invalid rating: ${rating}`)
  }

  const scheduledCard = result.card
  let intervalDays = scheduledCard.scheduled_days ?? 1

  // ── Min-first-interval clamp (only on the very first review) ────────────────
  if (isFirstReview) {
    intervalDays = Math.max(intervalDays, minFirstIntervalDays)
  }

  // Compute retrievability at time of review (before grading)
  const daysSinceLastReview = currentState?.last_review_at
    ? (now.getTime() - new Date(currentState.last_review_at).getTime()) / (1000 * 60 * 60 * 24)
    : 0

  const retrievability =
    currentState?.stability && currentState.stability > 0
      ? Math.exp((-0.693 * daysSinceLastReview) / currentState.stability)
      : 0

  // Compute the actual due date based on clamped interval
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + Math.round(intervalDays))

  const stateIndex = scheduledCard.state as 0 | 1 | 2 | 3
  let stateName = STATE_NAMES[stateIndex] ?? 'Review'
  
  if (stateName === 'Learning') {
    stateName = 'Review'
  }

  const newState: Omit<FsrsState, 'problem_id'> = {
    stability: scheduledCard.stability,
    difficulty: scheduledCard.difficulty,
    reps: scheduledCard.reps,
    lapses: scheduledCard.lapses,
    state: stateName,
    due_at: dueDate.toISOString(),
    last_review_at: now.toISOString(),
  }

  return { newState, intervalDays, retrievability }
}

/**
 * Compute current retrievability for a card (for display/sorting purposes).
 * Returns a value in [0, 1], where 1 = perfectly remembered, 0 = forgotten.
 */
export function computeRetrievability(state: FsrsState): number {
  if (!state.stability || !state.last_review_at) return 0
  const daysSince =
    (Date.now() - new Date(state.last_review_at).getTime()) / (1000 * 60 * 60 * 24)
  return Math.exp((-0.693 * daysSince) / state.stability)
}
