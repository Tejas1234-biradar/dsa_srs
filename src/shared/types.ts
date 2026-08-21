// ============================================================
// Shared types — used by both main process and renderer via IPC
// ============================================================

// ---- DB Entities ----

export interface Problem {
  id: number
  title: string
  url: string | null
  source: string | null
  pattern_tags: string // JSON array string
  recognition_cue: string | null
  difficulty: 'Easy' | 'Medium' | 'Hard' | null
  created_at: string
  is_leech: 0 | 1
}

export interface FsrsState {
  problem_id: number
  stability: number | null
  difficulty: number | null
  reps: number
  lapses: number
  state: 'New' | 'Learning' | 'Review' | 'Relearning'
  due_at: string | null
  last_review_at: string | null
}

export interface ReviewLog {
  id: number
  problem_id: number
  reviewed_at: string
  grade: 1 | 2 | 3 | 4  // 1=Again 2=Hard 3=Good 4=Easy
  interval_days: number
  retrievability_at_review: number
}

export interface ActivityDay {
  date: string
  count: number
}

export interface ActivityStats {
  days: ActivityDay[]
  dailyAverage: number
  daysLearned: number
  longestStreak: number
  currentStreak: number
}

export interface LeetCodeProblem {
  slug: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard' | null
  tags: string   // JSON array string
  url: string
  cached_at: string
}

export interface Setting {
  key: string
  value: string
}

export interface DailyPick {
  id: number
  slug: string
  surfaced_at: string   // ISO date string (YYYY-MM-DD)
  status: 'pending' | 'solved' | 'struggled' | 'skipped'
  // Display fields copied from LeetCode cache at insert time so rows remain usable
  title: string | null
  url: string | null
  difficulty: 'Easy' | 'Medium' | 'Hard' | null
  tags: string | null // JSON array string
}

// ---- Settings keys & defaults ----

export type SettingKey =
  | 'desired_retention'
  | 'min_first_interval_days'
  | 'new_cards_per_day'
  | 'daily_review_cap'
  | 'pattern_rotation'       // JSON array of pattern strings
  | 'difficulty_progression'  // JSON: { easy: number, medium: number, hard: number }

export const DEFAULT_SETTINGS: Record<SettingKey, string> = {
  desired_retention: '0.85',
  min_first_interval_days: '5',
  new_cards_per_day: '2',
  daily_review_cap: '30',
  pattern_rotation: JSON.stringify([
    'Two Pointers',
    'Sliding Window',
    'Binary Search',
    'Dynamic Programming',
    'Graphs / BFS / DFS',
    'Trees',
    'Greedy',
    'Backtracking',
    'Monotonic Stack',
    'Heap / Priority Queue',
    'DSU / Union-Find',
    'Bit Manipulation',
    'Math',
    'Intervals',
  ]),
  difficulty_progression: JSON.stringify({ Easy: 15, Medium: 70, Hard: 15 }),
}

// ---- Today Screen types ----

export type Grade = 1 | 2 | 3 | 4

export interface TodayNewPick {
  type: 'new'
  pick_id: number
  slug: string
  title: string
  url: string
  difficulty: string | null
  primary_tag: string | null
}

export interface TodayReview {
  type: 'review'
  problem_id: number
  title: string
  url: string | null
  recognition_cue: string | null
  pattern_tags: string[]
  difficulty: string | null
  is_leech: boolean
  due_at: string
  retrievability: number
}

export type TodayItem = TodayNewPick | TodayReview

// ---- IPC Channel Definitions ----

export type IpcChannel =
  // Problems
  | 'problems:add'
  | 'problems:list'
  | 'problems:search'
  // Reviews
  | 'reviews:grade'
  | 'reviews:logNewPick'
  | 'reviews:activity'
  // Today
  | 'today:getQueue'
  // LeetCode cache
  | 'leetcode:search'
  | 'leetcode:refresh'
  | 'leetcode:status'
  // Settings
  | 'settings:get'
  | 'settings:set'
  | 'settings:getAll'

// ---- IPC Payloads ----

export interface AddProblemPayload {
  title: string
  url?: string
  source?: string
  pattern_tags: string[]
  recognition_cue?: string
  difficulty?: 'Easy' | 'Medium' | 'Hard'
}

export interface GradeReviewPayload {
  problem_id: number
  grade: Grade
}

export interface LogNewPickResultPayload {
  pick_id: number
  slug: string
  result: 'solved' | 'struggled' | 'skipped'
  recognition_cue?: string
}

export interface SettingSetPayload {
  key: SettingKey
  value: string
}

// ---- IPC Responses ----

export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}
