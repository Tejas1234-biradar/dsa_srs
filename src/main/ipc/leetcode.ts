import type { IpcMain } from 'electron'
import { getDb } from '../db/database'
import { searchLeetCodeProblems, countLeetCodeCache, getLeetCodeCacheAge } from '../db/schema'
import { refreshLeetCodeCache } from '../leetcode/fetcher'
import type { IpcResponse, LeetCodeProblem } from '../../shared/types'

export function registerLeetCodeHandlers(ipcMain: IpcMain): void {
  // Fuzzy search against local LC cache
  ipcMain.handle(
    'leetcode:search',
    async (_, query: string): Promise<IpcResponse<LeetCodeProblem[]>> => {
      try {
        const data = searchLeetCodeProblems(getDb(), query, 20)
        return { success: true, data }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Manual refresh trigger
  ipcMain.handle('leetcode:refresh', async (): Promise<IpcResponse<{ fetched: number; skipped: boolean }>> => {
    try {
      const result = await refreshLeetCodeCache(getDb())
      return { success: true, data: { fetched: result.fetched, skipped: result.skipped } }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Status: how many problems are cached, when last refreshed
  ipcMain.handle('leetcode:status', async (): Promise<IpcResponse<{ count: number; lastRefresh: string | null }>> => {
    try {
      const db = getDb()
      const count = countLeetCodeCache(db)
      const lastRefresh = getLeetCodeCacheAge(db)
      return { success: true, data: { count, lastRefresh } }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
