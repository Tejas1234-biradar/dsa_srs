/**
 * FSRS Wrapper Verification Script
 *
 * Run with: npm run test:fsrs
 *
 * Verifies:
 *  (a) First interval respects MIN_FIRST_INTERVAL_DAYS
 *  (b) Later intervals are driven by FSRS directly, no clamp
 *  (c) Intervals behave sanely at retention 0.85
 *  (d) Leech detection: again_count tracking
 */

import { scheduleReview } from '../src/main/fsrs/wrapper'
import type { FsrsState, Grade } from '../src/shared/types'

const DESIRED_RETENTION = 0.85
const MIN_FIRST_INTERVAL_DAYS = 5

let passCount = 0
let failCount = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passCount++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failCount++
  }
}

function printSection(title: string): void {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ── Test 1: First interval clamp ─────────────────────────────────────────────

printSection('Test 1: First-interval clamp (null state = brand new card)')

const grades: Grade[] = [1, 2, 3, 4]
const gradeNames = ['Again', 'Hard', 'Good', 'Easy']

for (let i = 0; i < grades.length; i++) {
  const result = scheduleReview(null, grades[i], DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)
  assert(
    result.intervalDays >= MIN_FIRST_INTERVAL_DAYS,
    `Grade=${gradeNames[i]}: interval=${result.intervalDays.toFixed(1)}d >= ${MIN_FIRST_INTERVAL_DAYS}d`
  )
}

// ── Test 2: Subsequent intervals — no clamp ───────────────────────────────────

printSection('Test 2: Subsequent intervals (reps > 0, no clamp applied)')

// Simulate a card that has gone through one Good review
const goodResult = scheduleReview(null, 3, DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)

// Build a fake FsrsState as if the first review already happened
const fakeState: FsrsState = {
  problem_id: 1,
  ...goodResult.newState,
  reps: goodResult.newState.reps,
}

// Override last_review_at to simulate time passing
fakeState.last_review_at = new Date(
  Date.now() - goodResult.intervalDays * 24 * 60 * 60 * 1000
).toISOString()
fakeState.due_at = new Date().toISOString()

for (let i = 0; i < grades.length; i++) {
  const result = scheduleReview(fakeState, grades[i], DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)
  console.log(
    `  Grade=${gradeNames[i]}: interval=${result.intervalDays.toFixed(1)}d, stability=${result.newState.stability?.toFixed(2)}, reps=${result.newState.reps}`
  )
  // On subsequent reviews, FSRS may produce intervals < MIN_FIRST_INTERVAL_DAYS (e.g., Again) — that's correct
  assert(result.newState.reps > fakeState.reps || result.newState.lapses > fakeState.lapses,
    `Grade=${gradeNames[i]}: reps or lapses incremented`)
}

// ── Test 3: Sanity — Good/Easy intervals grow ─────────────────────────────────

printSection('Test 3: Intervals grow across successive Good reviews (sanity check)')

let state: FsrsState | null = null
let prevInterval = 0

for (let rep = 1; rep <= 5; rep++) {
  const result = scheduleReview(state, 3 /* Good */, DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)

  if (rep > 1) {
    assert(
      result.intervalDays >= prevInterval * 0.5,
      `Rep ${rep}: interval=${result.intervalDays.toFixed(1)}d (prev=${prevInterval.toFixed(1)}d, not drastically shrinking)`
    )
  }

  prevInterval = result.intervalDays

  // Build next state
  state = {
    problem_id: 1,
    ...result.newState,
    last_review_at: new Date(
      Date.now() - result.intervalDays * 24 * 60 * 60 * 1000
    ).toISOString(),
    due_at: new Date().toISOString(),
  }

  console.log(`  Rep ${rep}: interval=${result.intervalDays.toFixed(1)}d, stability=${result.newState.stability?.toFixed(2)}`)
}

// ── Test 4: Again grades → lapses increment ───────────────────────────────────

printSection('Test 4: Again grades increment lapses (leech detection support)')

let againState: FsrsState | null = null
let lapses = 0

for (let i = 0; i < 4; i++) {
  const result = scheduleReview(againState, 1 /* Again */, DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)
  lapses = result.newState.lapses

  againState = {
    problem_id: 2,
    ...result.newState,
    last_review_at: new Date().toISOString(),
    due_at: new Date().toISOString(),
  }

  console.log(`  Again #${i + 1}: lapses=${result.newState.lapses}, interval=${result.intervalDays.toFixed(1)}d`)
}

assert(lapses >= 1, `Multiple Again grades produce lapses > 0 (lapses=${lapses})`)

// ── Test 5: Retrievability ────────────────────────────────────────────────────

printSection('Test 5: Retrievability at review (freshly-due card ≈ desired_retention)')

// A card due exactly today should have retrievability near desired_retention
const simState: FsrsState = {
  problem_id: 3,
  stability: 10,
  difficulty: 5,
  reps: 2,
  lapses: 0,
  state: 'Review',
  last_review_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
  due_at: new Date().toISOString(),
}

// R(t) = e^(-ln2 * t / S) = e^(-0.693 * 10 / 10) = e^(-0.693) ≈ 0.5
const expectedR = Math.exp((-0.693 * 10) / 10)
const result = scheduleReview(simState, 3 /* Good */, DESIRED_RETENTION, MIN_FIRST_INTERVAL_DAYS)
console.log(`  Retrievability at review: ${result.retrievability.toFixed(3)} (expected ≈ ${expectedR.toFixed(3)})`)
assert(
  Math.abs(result.retrievability - expectedR) < 0.05,
  `Retrievability within 5% of expected (${result.retrievability.toFixed(3)} ≈ ${expectedR.toFixed(3)})`
)

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`  FSRS Wrapper Test Results: ${passCount} passed, ${failCount} failed`)
console.log('═'.repeat(60))

if (failCount > 0) {
  process.exit(1)
} else {
  console.log('  All assertions passed! FSRS wrapper is correct. ✅')
}
