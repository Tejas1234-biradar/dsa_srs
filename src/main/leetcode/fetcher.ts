/**
 * LeetCode GraphQL cache fetcher.
 *
 * Fetches the full problem list from LeetCode's public GraphQL endpoint
 * (no auth required for problem metadata) and upserts into the local
 * `leetcode_problems` SQLite table.
 *
 * Refreshes at most once per day — checks the max cached_at date before hitting
 * the network. Falls back gracefully if the network is unavailable.
 */

import type Database from 'better-sqlite3'
import { upsertLeetCodeProblem, getLeetCodeCacheAge } from '../db/schema'
import type { LeetCodeProblem } from '../../shared/types'

const GRAPHQL_URL = 'https://leetcode.com/graphql'
const PAGE_SIZE = 100

interface LcTag {
  name: string
  slug: string
}

interface LcQuestion {
  titleSlug: string
  title: string
  difficulty: string
  topicTags: LcTag[]
}

interface LcResponse {
  data: {
    problemsetQuestionList: {
      total: number
      questions: LcQuestion[]
    }
  }
}

function buildQuery(skip: number, limit: number): string {
  return JSON.stringify({
    query: `
      query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(
          categorySlug: $categorySlug
          limit: $limit
          skip: $skip
          filters: $filters
        ) {
          total: totalNum
          questions: data {
            titleSlug
            title
            difficulty
            topicTags {
              name
              slug
            }
          }
        }
      }
    `,
    variables: { categorySlug: '', skip, limit, filters: {} },
  })
}

function isCacheStale(latestCachedAt: string | null): boolean {
  if (!latestCachedAt) return true
  const now = Date.now()
  const cached = new Date(latestCachedAt).getTime()
  const hoursSince = (now - cached) / (1000 * 60 * 60)
  return hoursSince >= 24
}

export async function refreshLeetCodeCache(db: Database.Database): Promise<{
  fetched: number
  skipped: boolean
  error?: string
}> {
  const latestCachedAt = getLeetCodeCacheAge(db)

  if (!isCacheStale(latestCachedAt)) {
    return { fetched: 0, skipped: true }
  }

  try {
    let skip = 0
    let total = Infinity
    let fetched = 0
    const now = new Date().toISOString()

    while (skip < total) {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'User-Agent': 'Mozilla/5.0 DSA-SRS-App',
        },
        body: buildQuery(skip, PAGE_SIZE),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const json = (await response.json()) as LcResponse
      const list = json.data?.problemsetQuestionList

      if (!list) {
        throw new Error('Unexpected response structure from LeetCode GraphQL')
      }

      total = list.total

      const upsertMany = db.transaction((questions: LcQuestion[]) => {
        for (const q of questions) {
          const problem: LeetCodeProblem = {
            slug: q.titleSlug,
            title: q.title,
            difficulty: (q.difficulty as 'Easy' | 'Medium' | 'Hard') ?? null,
            tags: JSON.stringify(q.topicTags.map(t => t.name)),
            url: `https://leetcode.com/problems/${q.titleSlug}/`,
            cached_at: now,
          }
          upsertLeetCodeProblem(db, problem)
        }
      })

      upsertMany(list.questions)
      fetched += list.questions.length
      skip += PAGE_SIZE

      // Small delay to avoid hammering the endpoint
      if (skip < total) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    return { fetched, skipped: false }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[LeetCode] Cache refresh failed:', error)
    return { fetched: 0, skipped: false, error }
  }
}
