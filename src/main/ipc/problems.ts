import type { IpcMain } from 'electron'
import { getDb } from '../db/database'
import {
  insertProblem,
  listProblems,
  searchProblems,
  upsertFsrsState,
} from '../db/schema'
import type {
  AddProblemPayload,
  IpcResponse,
  Problem,
} from '../../shared/types'

export function registerProblemsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'problems:add',
    async (_, payload: AddProblemPayload): Promise<IpcResponse<number>> => {
      try {
        const db = getDb()
        const id = insertProblem(db, {
          title: payload.title,
          url: payload.url ?? null,
          source: payload.source ?? null,
          pattern_tags: JSON.stringify(payload.pattern_tags),
          recognition_cue: payload.recognition_cue ?? null,
          difficulty: payload.difficulty ?? null,
        })

        // Create initial FSRS state (reps=0, no due date yet — card is "New")
        upsertFsrsState(db, {
          problem_id: id,
          stability: null,
          difficulty: null,
          reps: 0,
          lapses: 0,
          state: 'New',
          due_at: null,
          last_review_at: null,
        })

        return { success: true, data: id }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  ipcMain.handle(
    'problems:list',
    async (
      _,
      opts: { tag?: string; is_leech?: boolean; limit?: number; offset?: number } = {}
    ): Promise<IpcResponse<Problem[]>> => {
      try {
        const data = listProblems(getDb(), opts)
        return { success: true, data }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  ipcMain.handle(
    'problems:search',
    async (_, query: string): Promise<IpcResponse<Problem[]>> => {
      try {
        const data = searchProblems(getDb(), query)
        return { success: true, data }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )
}
