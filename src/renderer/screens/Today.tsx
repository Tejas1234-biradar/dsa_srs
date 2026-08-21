import { useEffect, useState, useCallback } from 'react'
import type { ActivityStats, TodayItem, TodayNewPick, TodayReview, Grade } from '@shared/types'
import { getActivityStats, getTodayQueue, gradeReview, logNewPickResult, refreshLeetCode } from '../ipc'
import { Heatmap } from './Stats'

// ── Helpers ───────────────────────────────────────────────────────────────────

function difficultyClass(d: string | null) {
  if (!d) return ''
  return `tag tag-${d.toLowerCase()}`
}

function retrievabilityColor(r: number): string {
  if (r >= 0.7) return 'var(--green)'
  if (r >= 0.4) return 'var(--yellow)'
  return 'var(--red)'
}

// ── New Pick Card ─────────────────────────────────────────────────────────────

type PickResult = 'solved' | 'struggled' | 'skipped'

interface NewPickCardProps {
  item: TodayNewPick
  onDone: () => void
}

function NewPickCard({ item, onDone }: NewPickCardProps) {
  const [pendingResult, setPendingResult] = useState<PickResult | null>(null)
  const [cue, setCue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleResultClick(result: PickResult) {
    if (result === 'skipped') {
      setSubmitting(true)
      await logNewPickResult({ pick_id: item.pick_id, slug: item.slug, result: 'skipped' })
      onDone()
      return
    }
    setPendingResult(result)
  }

  async function handleSubmitCue() {
    if (!pendingResult) return
    setSubmitting(true)
    await logNewPickResult({
      pick_id: item.pick_id,
      slug: item.slug,
      result: pendingResult,
      recognition_cue: cue.trim() || undefined,
    })
    onDone()
  }

  return (
    <div className="card card-new fade-in">
      <div className="problem-meta">
        <span className="tag tag-new">New Pick</span>
        {item.difficulty && <span className={difficultyClass(item.difficulty)}>{item.difficulty}</span>}
        {item.primary_tag && <span className="tag tag-pattern">{item.primary_tag}</span>}
      </div>

      <div className="problem-title">
        <a href={item.url} target="_blank" rel="noreferrer" id={`pick-link-${item.pick_id}`}>
          {item.title}
        </a>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
        Solve this on LeetCode, then come back and mark your result.
      </p>

      {!pendingResult && (
        <div className="pick-actions">
          <button
            id={`pick-solved-${item.pick_id}`}
            className="btn btn-secondary"
            style={{ background: 'var(--green-dim)', color: 'var(--green)', borderColor: 'rgba(34,197,94,0.3)', flex: 1 }}
            onClick={() => handleResultClick('solved')}
            disabled={submitting}
          >
            ✓ Solved
          </button>
          <button
            id={`pick-struggled-${item.pick_id}`}
            className="btn btn-secondary"
            style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)', borderColor: 'rgba(234,179,8,0.3)', flex: 1 }}
            onClick={() => handleResultClick('struggled')}
            disabled={submitting}
          >
            ~ Struggled
          </button>
          <button
            id={`pick-skipped-${item.pick_id}`}
            className="btn btn-ghost"
            style={{ flex: 0.5 }}
            onClick={() => handleResultClick('skipped')}
            disabled={submitting}
          >
            Skip
          </button>
        </div>
      )}

      {pendingResult && (
        <div className="cue-overlay">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            <strong style={{ color: pendingResult === 'solved' ? 'var(--green)' : 'var(--yellow)' }}>
              {pendingResult === 'solved' ? '✓ Solved!' : '~ Struggled'}
            </strong>{' '}
            — What tipped you off to the approach? <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </p>
          <textarea
            className="form-textarea"
            id={`pick-cue-${item.pick_id}`}
            placeholder="e.g. 'Saw overlapping intervals → greedy sort by end time'"
            rows={2}
            value={cue}
            onChange={e => setCue(e.target.value)}
          />
          <div className="pick-actions mt-2">
            <button
              id={`pick-submit-${item.pick_id}`}
              className="btn btn-primary"
              onClick={handleSubmitCue}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Done →'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSubmitCue}
              disabled={submitting}
            >
              Skip cue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────────────────────

interface ReviewCardProps {
  item: TodayReview
  onDone: () => void
}

function ReviewCard({ item, onDone }: ReviewCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [revealed, setRevealed] = useState(false)

  async function handleGrade(grade: Grade) {
    setSubmitting(true)
    await gradeReview({ problem_id: item.problem_id, grade })
    onDone()
  }

  const r = item.retrievability
  const fillColor = retrievabilityColor(r)

  return (
    <div className={`card ${item.is_leech ? 'card-leech' : 'card-review'} fade-in`}>
      <div className="retrievability-bar">
        <div
          className="retrievability-fill"
          style={{ width: `${Math.round(r * 100)}%`, background: fillColor }}
        />
      </div>

      <div className="problem-meta">
        <span className="tag" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.2)' }}>
          Review
        </span>
        {item.is_leech && <span className="tag tag-leech">🐛 Leech</span>}
        {item.difficulty && <span className={difficultyClass(item.difficulty)}>{item.difficulty}</span>}
        {item.pattern_tags.slice(0, 2).map(tag => (
          <span key={tag} className="tag tag-pattern">{tag}</span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          R = {Math.round(r * 100)}%
        </span>
      </div>

      <div className="problem-title">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" id={`review-link-${item.problem_id}`}>
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </div>

      {item.recognition_cue && (
        <div className="problem-cue" id={`review-cue-${item.problem_id}`}>
          💡 {item.recognition_cue}
        </div>
      )}

      {!revealed && (
        <button
          className="btn btn-secondary"
          style={{ width: '100%', marginBottom: 'var(--space-3)' }}
          onClick={() => setRevealed(true)}
          id={`review-reveal-${item.problem_id}`}
        >
          Rate your recall ↓
        </button>
      )}

      {revealed && (
        <div className="grade-buttons fade-in">
          <button
            id={`grade-again-${item.problem_id}`}
            className="btn-grade btn-grade-again"
            onClick={() => handleGrade(1)}
            disabled={submitting}
            title="Complete blackout — could not recall at all"
          >
            Again
          </button>
          <button
            id={`grade-hard-${item.problem_id}`}
            className="btn-grade btn-grade-hard"
            onClick={() => handleGrade(2)}
            disabled={submitting}
            title="Recalled with significant difficulty"
          >
            Hard
          </button>
          <button
            id={`grade-good-${item.problem_id}`}
            className="btn-grade btn-grade-good"
            onClick={() => handleGrade(3)}
            disabled={submitting}
            title="Recalled correctly with some effort"
          >
            Good
          </button>
          <button
            id={`grade-easy-${item.problem_id}`}
            className="btn-grade btn-grade-easy"
            onClick={() => handleGrade(4)}
            disabled={submitting}
            title="Recalled perfectly and quickly"
          >
            Easy
          </button>
        </div>
      )}
    </div>
  )
}

// ── Today Screen ──────────────────────────────────────────────────────────────

export default function Today() {
  const [queue, setQueue] = useState<TodayItem[]>([])
  const [activity, setActivity] = useState<ActivityStats | null>(null)
  const [doneItems, setDoneItems] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getTodayQueue()
    if (res.success && res.data) {
      setQueue(res.data)
    } else {
      setError(res.error ?? 'Failed to load queue')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  useEffect(() => {
    getActivityStats().then(res => {
      if (res.success && res.data) setActivity(res.data)
    })
  }, [])

  function markDone(key: string) {
    setDoneItems(prev => new Set([...prev, key]))
  }

  function itemKey(item: TodayItem) {
    return item.type === 'new'
      ? `new-${item.pick_id}`
      : `review-${item.problem_id}`
  }

  const visibleQueue = queue.filter(item => !doneItems.has(itemKey(item)))
  const newPicks = visibleQueue.filter(i => i.type === 'new') as TodayNewPick[]
  const reviews = visibleQueue.filter(i => i.type === 'review') as TodayReview[]
  const totalDone = doneItems.size
  const totalItems = queue.length
  const allDone = totalItems > 0 && visibleQueue.length === 0
  const activityPanel = activity && (
    <section className="today-activity">
      <div className="section-header">
        <span className="section-title">Study activity</span>
        <span className="section-count">{activity.currentStreak} day streak</span>
      </div>
      <Heatmap days={activity.days} />
      <div className="stats-metrics today-activity-metrics">
        <div>Daily average: <strong>{activity.dailyAverage}</strong> cards</div>
        <div>Days learned: <strong>{activity.daysLearned}%</strong></div>
        <div>Longest streak: <strong>{activity.longestStreak} days</strong></div>
      </div>
    </section>
  )

  async function handleRefreshLC() {
    setRefreshing(true)
    await refreshLeetCode()
    setRefreshing(false)
    await loadQueue()
  }

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">Failed to load today's queue</div>
        <div className="empty-state-desc">{error}</div>
        <button className="btn btn-primary mt-4" onClick={loadQueue}>Retry</button>
      </div>
    )
  }

  if (allDone) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="done-state fade-in">
          <div className="done-icon">✓</div>
          <div className="done-title">All done for today!</div>
          <div className="done-subtitle">
            You completed {totalDone} item{totalDone !== 1 ? 's' : ''}. Come back tomorrow for your next session.
          </div>
        </div>
        {activityPanel}
      </div>
    )
  }

  if (totalItems === 0) {
    return (
      <div>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">Today</h1>
              <p className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <button
              id="refresh-lc-btn"
              className="btn btn-secondary"
              onClick={handleRefreshLC}
              disabled={refreshing}
            >
              {refreshing ? 'Fetching…' : '↻ Fetch LeetCode Problems'}
            </button>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-title">Nothing due today</div>
          <div className="empty-state-desc">
            No problems are due for review and the LeetCode cache may be empty.
            Click "Fetch LeetCode Problems" to download the problem list and generate today's picks.
          </div>
        </div>
        {activityPanel}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Today</h1>
            <p className="page-subtitle">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              {visibleQueue.length} remaining{totalDone > 0 ? ` · ${totalDone} done` : ''}
            </p>
          </div>
        </div>
      </div>

      {activityPanel}

      {/* Progress bar */}
      {totalItems > 0 && (
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(totalDone / totalItems) * 100}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--green))',
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {totalDone} / {totalItems} completed
          </p>
        </div>
      )}

      {/* New picks section */}
      {newPicks.length > 0 && (
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div className="section-header">
            <span className="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
              </svg>
              New Problems
            </span>
            <span className="section-count">{newPicks.length}</span>
          </div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {newPicks.map(item => (
              <NewPickCard
                key={itemKey(item)}
                item={item}
                onDone={() => markDone(itemKey(item))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Due reviews section */}
      {reviews.length > 0 && (
        <div>
          <div className="section-header">
            <span className="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.1" />
              </svg>
              Due Reviews
            </span>
            <span className="section-count">{reviews.length}</span>
          </div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {reviews.map(item => (
              <ReviewCard
                key={itemKey(item)}
                item={item}
                onDone={() => markDone(itemKey(item))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
