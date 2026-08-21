/**
 * Typed IPC bridge for the renderer.
 * Wraps window.api.invoke with full TypeScript types.
 */

import type {
  AddProblemPayload,
  GradeReviewPayload,
  IpcResponse,
  LeetCodeProblem,
  LogNewPickResultPayload,
  Problem,
  SettingKey,
  SettingSetPayload,
  TodayItem,
  ActivityStats,
} from '@shared/types'

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResponse<T>> {
  if (!window.api) {
    console.warn(`[ipc] window.api not found — running outside Electron. Channel: ${channel}`)
    return { success: false, error: 'Not running in Electron — window.api is unavailable.' } as IpcResponse<T>
  }
  return window.api.invoke(channel, ...args) as Promise<IpcResponse<T>>
}

// ── Today ──────────────────────────────────────────────────────────────────────
export const getTodayQueue = () => invoke<TodayItem[]>('today:getQueue')

// ── Problems ──────────────────────────────────────────────────────────────────
export const addProblem = (payload: AddProblemPayload) =>
  invoke<number>('problems:add', payload)

export const listProblems = (opts?: {
  tag?: string
  is_leech?: boolean
  limit?: number
  offset?: number
}) => invoke<Problem[]>('problems:list', opts ?? {})

export const searchProblems = (query: string) =>
  invoke<Problem[]>('problems:search', query)

// ── Reviews ───────────────────────────────────────────────────────────────────
export const gradeReview = (payload: GradeReviewPayload) =>
  invoke<void>('reviews:grade', payload)

export const logNewPickResult = (payload: LogNewPickResultPayload) =>
  invoke<void>('reviews:logNewPick', payload)

export const getActivityStats = () => invoke<ActivityStats>('reviews:activity')

// ── LeetCode ──────────────────────────────────────────────────────────────────
export const searchLeetCode = (query: string) =>
  invoke<LeetCodeProblem[]>('leetcode:search', query)

export const refreshLeetCode = () =>
  invoke<{ fetched: number; skipped: boolean }>('leetcode:refresh')

export const getLeetCodeStatus = () =>
  invoke<{ count: number; lastRefresh: string | null }>('leetcode:status')

// ── Settings ──────────────────────────────────────────────────────────────────
export const getAllSettings = () => invoke<Record<string, string>>('settings:getAll')
export const getSetting = (key: SettingKey) => invoke<string | null>('settings:get', key)
export const setSetting = (payload: SettingSetPayload) =>
  invoke<void>('settings:set', payload)
