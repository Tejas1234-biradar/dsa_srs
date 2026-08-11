import type { IpcMain } from 'electron'
import { getDb } from '../db/database'
import { getDueReviews, getSetting } from '../db/schema'
import { selectDailyProblems } from '../scheduler/dailySelector'
import type { IpcResponse, TodayItem, TodayReview } from '../../shared/types'

export function registerTodayHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('today:getQueue', async (): Promise<IpcResponse<TodayItem[]>> => {
    try {
      const db = getDb()
      const today = new Date().toISOString()
      const reviewCap = parseInt(getSetting(db, 'daily_review_cap') ?? '30', 10)

      // 1. Due reviews (sorted by lowest retrievability)
      const dueRows = getDueReviews(db, today, reviewCap)
      const reviews: TodayReview[] = dueRows.map(row => ({
        type: 'review' as const,
        problem_id: row.id,
        title: row.title,
        url: row.url,
        recognition_cue: row.recognition_cue,
        pattern_tags: tryParseJson<string[]>(row.pattern_tags) ?? [],
        difficulty: row.difficulty,
        is_leech: row.is_leech === 1,
        due_at: row.due_at ?? '',
        retrievability: row.retrievability ?? 0,
      }))

      // 2. New daily picks (auto-selected)
      const newPicks = selectDailyProblems(db)

      // Interleave: new picks first, then due reviews
      const queue: TodayItem[] = [...newPicks, ...reviews]

      return { success: true, data: queue }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}

function tryParseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}
