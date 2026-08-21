import type { IpcMain } from 'electron'
import { getDb } from '../db/database'
import {
  getFsrsState,
  upsertFsrsState,
  insertReviewLog,
  insertProblem,
  getAgainCountForProblem,
  setLeechFlag,
  updateDailyPickStatus,
  getLeetCodeBySlug,
  getActivityStats,
} from '../db/schema'
import { getSetting } from '../db/schema'
import { scheduleReview } from '../fsrs/wrapper'
import type {
  GradeReviewPayload,
  IpcResponse,
  LogNewPickResultPayload,
} from '../../shared/types'

const LEECH_THRESHOLD = 4

export function registerReviewsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'reviews:activity',
    async (): Promise<IpcResponse<ReturnType<typeof getActivityStats>>> => {
      try {
        return { success: true, data: getActivityStats(getDb()) }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Grade an existing review card (due review flow)
  ipcMain.handle(
    'reviews:grade',
    async (_, payload: GradeReviewPayload): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()

        const desiredRetention = parseFloat(getSetting(db, 'desired_retention') ?? '0.85')
        const minFirstInterval = parseFloat(getSetting(db, 'min_first_interval_days') ?? '5')

        const currentState = getFsrsState(db, payload.problem_id)
        const result = scheduleReview(currentState, payload.grade, desiredRetention, minFirstInterval)

        // Persist new FSRS state
        upsertFsrsState(db, {
          problem_id: payload.problem_id,
          ...result.newState,
        })

        // Log the review
        insertReviewLog(db, {
          problem_id: payload.problem_id,
          grade: payload.grade,
          interval_days: result.intervalDays,
          retrievability_at_review: result.retrievability,
        })

        // Leech detection: count Again ratings
        if (payload.grade === 1) {
          const againCount = getAgainCountForProblem(db, payload.problem_id)
          if (againCount >= LEECH_THRESHOLD) {
            setLeechFlag(db, payload.problem_id, true)
          }
        }

        return { success: true }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Log result of a new daily pick (Solved / Struggled / Skipped)
  ipcMain.handle(
    'reviews:logNewPick',
    async (_, payload: LogNewPickResultPayload): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()

        // Update pick status
        updateDailyPickStatus(db, payload.pick_id, payload.result)

        if (payload.result === 'skipped') {
          // Don't create a card yet — will resurface after cooldown
          return { success: true }
        }

        // Map result to grade: Solved→Good(3), Struggled→Hard(2)
        const grade = payload.result === 'solved' ? 3 : 2

        // Fetch LC problem info for the slug
        const lc = getLeetCodeBySlug(db, payload.slug)

        // Create the problem record
        const problemId = insertProblem(db, {
          title: lc?.title ?? payload.slug,
          url: lc ? `https://leetcode.com/problems/${payload.slug}/` : null,
          source: 'LeetCode',
          pattern_tags: lc?.tags ?? '[]',
          recognition_cue: payload.recognition_cue ?? null,
          difficulty: (lc?.difficulty as 'Easy' | 'Medium' | 'Hard') ?? null,
        })

        // Schedule first review (this IS review #1, with the min-first-interval clamp)
        const desiredRetention = parseFloat(getSetting(db, 'desired_retention') ?? '0.85')
        const minFirstInterval = parseFloat(getSetting(db, 'min_first_interval_days') ?? '5')
        const result = scheduleReview(null, grade, desiredRetention, minFirstInterval)

        upsertFsrsState(db, {
          problem_id: problemId,
          ...result.newState,
        })

        insertReviewLog(db, {
          problem_id: problemId,
          grade,
          interval_days: result.intervalDays,
          retrievability_at_review: 0,  // First review — no prior retrievability
        })

        return { success: true }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )
}
