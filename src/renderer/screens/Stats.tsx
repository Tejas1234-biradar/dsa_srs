import { useEffect, useMemo, useState } from 'react'
import type { ActivityDay, ActivityStats } from '@shared/types'
import { getActivityStats } from '../ipc'

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const WEEK_COUNT = 53

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getLevel(count: number, max: number): number {
  if (!count) return 0
  if (count >= max * 0.75) return 4
  if (count >= max * 0.5) return 3
  if (count >= max * 0.25) return 2
  return 1
}

export function Heatmap({ days }: { days: ActivityDay[] }) {
  const byDate = useMemo(() => new Map(days.map(day => [day.date, day])), [days])
  const max = Math.max(...days.map(day => day.count), 1)
  const end = new Date(`${days[days.length - 1]?.date ?? isoDate(new Date())}T00:00:00`)
  const first = new Date(`${days[0]?.date ?? isoDate(end)}T00:00:00`)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  const cells: (ActivityDay | null)[] = []
  for (let week = 0; week < WEEK_COUNT; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + week * 7 + weekday)
      const key = isoDate(date)
      cells.push(byDate.get(key) ?? { date: key, count: 0 })
    }
  }

  return (
    <div className="activity-heatmap-card">
      <div className="activity-heatmap-toolbar">
        <span className="activity-nav-button">‹</span>
        <span className="activity-year">{end.getFullYear()}</span>
        <span className="activity-nav-button">›</span>
      </div>
      <div className="activity-heatmap">
        <div className="activity-day-labels">
          {DAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        <div className="activity-grid">
          {cells.map((day, index) => (
            <div
              key={`${day?.date}-${index}`}
              className={`activity-cell level-${getLevel(day?.count ?? 0, max)}`}
              title={`${day?.date}: ${day?.count ?? 0} cards`}
            />
          ))}
        </div>
      </div>
      <div className="activity-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(level => <span key={level} className={`activity-cell level-${level}`} />)}
        <span>More</span>
      </div>
    </div>
  )
}

export default function Stats() {
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getActivityStats().then(result => {
      if (result.success && result.data) setStats(result.data)
      else setError(result.error ?? 'Failed to load activity')
    })
  }, [])

  if (error) return <div className="empty-state"><div className="empty-state-title">{error}</div></div>
  if (!stats) return <div className="loading-center"><div className="spinner" /></div>

  const todayCount = stats.days[stats.days.length - 1]?.count ?? 0
  return (
    <div className="stats-page">
      <div className="stats-header">
        <div className="stats-summary">
          Studied <strong>{todayCount}</strong> card{todayCount === 1 ? '' : 's'} in <strong>0</strong> seconds today ({todayCount}/card)
        </div>
      </div>
      <Heatmap days={stats.days} />
      <div className="stats-metrics">
        <div>Daily average: <strong>{stats.dailyAverage}</strong> cards</div>
        <div>Days learned: <strong>{stats.daysLearned}%</strong></div>
        <div>Longest streak: <strong>{stats.longestStreak} days</strong></div>
        <div>Current streak: <strong>{stats.currentStreak} day{stats.currentStreak === 1 ? '' : 's'}</strong></div>
      </div>
    </div>
  )
}
